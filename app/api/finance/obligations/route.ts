import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import type {
  FinanceObligationStatus,
  FinanceObligationType,
} from "@/lib/finance-obligations";
import {
  financeObligationFromRow,
  financeSettlementFromRow,
} from "@/lib/finance-obligations";
import {
  isSupabaseConfigured,
  supabaseInsert,
  supabasePatch,
  supabaseSelect,
} from "@/lib/supabase-rest";
import type { LinkedModule } from "@/lib/company-data";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type ObligationBody = {
  accountName?: string;
  action?:
    | "settle"
    | "cancel"
    | "reopen"
    | "update"
    | "void_settlement";
  amount?: number;
  cashboxName?: string;
  concept?: string;
  costCenterName?: string;
  date?: string;
  documentNumber?: string;
  dueDate?: string;
  id?: string;
  issueDate?: string;
  linkedModule?: LinkedModule;
  method?: string;
  notes?: string;
  partyName?: string;
  reference?: string;
  settlementId?: string;
  type?: FinanceObligationType;
};

export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "lector");
  if (auth.error) return auth.error;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      obligations: [],
      settlements: [],
      storageMode: "demo",
    });
  }

  try {
    const [obligationRows, settlementRows] = await Promise.all([
      supabaseSelect<Record<string, unknown>[]>(
        "finance_obligations?select=*&order=due_date.asc,created_at.desc",
      ),
      supabaseSelect<Record<string, unknown>[]>(
        "finance_obligation_settlements?select=*&order=settlement_date.desc,created_at.desc",
      ),
    ]);

    return NextResponse.json({
      obligations: obligationRows.map(financeObligationFromRow),
      settlements: settlementRows.map(financeSettlementFromRow),
      storageMode: "supabase",
    });
  } catch (error) {
    return obligationError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "editor");
  if (auth.error) return auth.error;

  const body = (await request.json()) as ObligationBody;
  const validationError = validateObligation(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const row = {
    account_name: clean(body.accountName),
    concept: clean(body.concept),
    cost_center_name: clean(body.costCenterName),
    created_by_name: auth.user.fullName,
    document_number: clean(body.documentNumber) || null,
    due_date: body.dueDate,
    id: randomUUID(),
    issue_date: body.issueDate,
    linked_module: body.linkedModule,
    notes: clean(body.notes) || null,
    obligation_type: body.type,
    original_amount: Number(body.amount),
    party_name: clean(body.partyName),
    status: "pendiente" satisfies FinanceObligationStatus,
  };

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        obligation: financeObligationFromRow({
          ...row,
          created_at: new Date().toISOString(),
        }),
        storageMode: "demo",
      },
      { status: 201 },
    );
  }

  try {
    const rows = await supabaseInsert<Record<string, unknown>[]>(
      "finance_obligations",
      row,
    );
    return NextResponse.json(
      {
        obligation: financeObligationFromRow(rows[0]),
        storageMode: "supabase",
      },
      { status: 201 },
    );
  } catch (error) {
    return obligationError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "editor");
  if (auth.error) return auth.error;

  const body = (await request.json()) as ObligationBody;
  const allowedActions: NonNullable<ObligationBody["action"]>[] = [
    "settle",
    "cancel",
    "reopen",
    "update",
    "void_settlement",
  ];
  if (
    !body.id ||
    !body.action ||
    !allowedActions.includes(body.action)
  ) {
    return NextResponse.json(
      { error: "Seleccione una cuenta y una accion." },
      { status: 400 },
    );
  }

  const canAdmin = hasPermission(
    auth.user,
    "financiero",
    "administrador",
  );
  if (body.action !== "update" && !canAdmin) {
    return NextResponse.json(
      {
        error:
          "Se requiere permiso de administrador para aplicar o anular cuentas.",
      },
      { status: 403 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      id: body.id,
      status:
        body.action === "cancel"
          ? "anulado"
          : body.action === "reopen"
            ? "pendiente"
            : body.action === "update"
              ? "pendiente"
              : body.action === "void_settlement"
                ? "anulado"
                : "pagado",
      storageMode: "demo",
    });
  }

  try {
    if (body.action === "update") {
      const validationError = validateObligation(body);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
      const obligation = await loadObligation(body.id);
      const activeSettlements = await loadActiveSettlementIds(body.id);
      if (
        obligation.status !== "pendiente" ||
        activeSettlements.length > 0
      ) {
        return NextResponse.json(
          {
            error:
              "Solo puede editarse una cuenta pendiente sin pagos o cobros.",
          },
          { status: 409 },
        );
      }
      const rows = await supabasePatch<Record<string, unknown>[]>(
        `finance_obligations?id=eq.${encodeURIComponent(body.id)}`,
        {
          account_name: clean(body.accountName),
          concept: clean(body.concept),
          cost_center_name: clean(body.costCenterName),
          document_number: clean(body.documentNumber) || null,
          due_date: body.dueDate,
          issue_date: body.issueDate,
          linked_module: body.linkedModule,
          notes: clean(body.notes) || null,
          obligation_type: body.type,
          original_amount: Number(body.amount),
          party_name: clean(body.partyName),
          updated_at: new Date().toISOString(),
        },
      );
      return NextResponse.json({
        obligation: financeObligationFromRow(rows[0]),
        storageMode: "supabase",
      });
    }

    if (body.action === "settle") {
      const validationError = validateSettlement(body);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const settlementRows = await supabaseInsert<Record<string, unknown>[]>(
        "rpc/finance_settle_obligation",
        {
          p_amount: Number(body.amount),
          p_cashbox_name: clean(body.cashboxName),
          p_created_by_name: auth.user.fullName,
          p_obligation_id: body.id,
          p_payment_method: clean(body.method),
          p_reference: clean(body.reference),
          p_settlement_date: body.date,
          p_settlement_id: randomUUID(),
          p_notes: clean(body.notes),
        },
      );
      const obligation = await loadObligation(body.id);
      return NextResponse.json({
        obligation,
        settlement: financeSettlementFromRow(settlementRows[0]),
        storageMode: "supabase",
      });
    }

    if (body.action === "void_settlement") {
      if (!body.settlementId) {
        return NextResponse.json(
          { error: "Seleccione el pago o cobro que desea anular." },
          { status: 400 },
        );
      }
      const settlementRows = await supabaseInsert<Record<string, unknown>[]>(
        "rpc/finance_void_obligation_settlement",
        {
          p_settlement_id: body.settlementId,
        },
      );
      const obligation = await loadObligation(body.id);
      return NextResponse.json({
        obligation,
        settlement: financeSettlementFromRow(settlementRows[0]),
        storageMode: "supabase",
      });
    }

    const obligation = await loadObligation(body.id);
    const activeSettlements = await loadActiveSettlementIds(body.id);

    if (body.action === "cancel") {
      if (
        obligation.status !== "pendiente" ||
        activeSettlements.length > 0
      ) {
        return NextResponse.json(
          {
            error:
              "Solo puede anularse una cuenta pendiente sin pagos o cobros.",
          },
          { status: 409 },
        );
      }
      const rows = await supabasePatch<Record<string, unknown>[]>(
        `finance_obligations?id=eq.${encodeURIComponent(body.id)}`,
        { status: "anulado", updated_at: new Date().toISOString() },
      );
      return NextResponse.json({
        obligation: financeObligationFromRow(rows[0]),
        storageMode: "supabase",
      });
    }

    if (obligation.status !== "anulado" || activeSettlements.length > 0) {
      return NextResponse.json(
        { error: "Esta cuenta no puede reactivarse." },
        { status: 409 },
      );
    }
    const rows = await supabasePatch<Record<string, unknown>[]>(
      `finance_obligations?id=eq.${encodeURIComponent(body.id)}`,
      { status: "pendiente", updated_at: new Date().toISOString() },
    );
    return NextResponse.json({
      obligation: financeObligationFromRow(rows[0]),
      storageMode: "supabase",
    });
  } catch (error) {
    return obligationError(error);
  }
}

async function loadObligation(id: string) {
  const rows = await supabaseSelect<Record<string, unknown>[]>(
    `finance_obligations?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  if (!rows[0]) throw new Error("Cuenta no encontrada.");
  return financeObligationFromRow(rows[0]);
}

async function loadActiveSettlementIds(id: string) {
  return supabaseSelect<Record<string, unknown>[]>(
    `finance_obligation_settlements?obligation_id=eq.${encodeURIComponent(
      id,
    )}&status=eq.confirmado&select=id&limit=1`,
  );
}

function validateObligation(body: ObligationBody) {
  if (body.type !== "pagar" && body.type !== "cobrar") {
    return "Seleccione el tipo de cuenta.";
  }
  if (!clean(body.partyName)) {
    return body.type === "pagar"
      ? "Ingrese el proveedor."
      : "Ingrese el cliente.";
  }
  if (!clean(body.concept)) return "Ingrese el concepto.";
  if (!isDate(body.issueDate) || !isDate(body.dueDate)) {
    return "Ingrese fechas validas.";
  }
  if (body.dueDate! < body.issueDate!) {
    return "El vencimiento no puede ser anterior a la emision.";
  }
  if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) {
    return "Ingrese un monto valido.";
  }
  if (!body.linkedModule) return "Seleccione el modulo.";
  if (!clean(body.accountName)) return "Seleccione la cuenta contable.";
  if (!clean(body.costCenterName)) return "Seleccione el centro de costo.";
  return "";
}

function validateSettlement(body: ObligationBody) {
  if (!isDate(body.date)) return "Ingrese la fecha del pago o cobro.";
  if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) {
    return "Ingrese un importe valido.";
  }
  if (!clean(body.cashboxName)) return "Seleccione la caja.";
  if (!clean(body.method)) return "Seleccione el medio.";
  return "";
}

function isDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function clean(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function obligationError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "No se pudo guardar la cuenta.";
  const migrationRequired =
    message.includes("finance_obligations") ||
    message.includes("finance_obligation_settlements") ||
    message.includes("finance_settle_obligation") ||
    message.includes("finance_void_obligation_settlement") ||
    message.includes("PGRST205") ||
    message.includes("PGRST202");

  return NextResponse.json(
    {
      error: migrationRequired
        ? "Falta ejecutar la actualizacion de cuentas por pagar y cobrar en Supabase."
        : readableError(message),
      migrationRequired,
    },
    { status: migrationRequired ? 409 : 400 },
  );
}

function readableError(message: string) {
  if (message.includes("supera el saldo")) {
    return "El importe supera el saldo pendiente.";
  }
  if (message.includes("ya esta cerrada")) {
    return "La cuenta ya esta pagada, cobrada o anulada.";
  }
  if (message.includes("Aplicacion no encontrada")) {
    return "El pago o cobro seleccionado ya no existe.";
  }
  if (message.includes("Aplicacion ya anulada")) {
    return "El pago o cobro ya estaba anulado.";
  }
  if (message.includes("Cuenta no encontrada")) {
    return "La cuenta seleccionada ya no existe.";
  }
  return message;
}
