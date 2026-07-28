import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import {
  cashExpenseAllocationFromRow,
  cashExpenseDocumentFromRow,
  cashExpenseImportBatchFromRow,
  importedCommerceRecordFromRow,
  type CashExpenseAllocation,
  type CashExpenseDocument,
  type CashExpenseStatus,
} from "@/lib/cash-expenses";
import type { LinkedModule } from "@/lib/company-data";
import { hasPermission } from "@/lib/permissions";
import {
  isSupabaseConfigured,
  supabaseInsert,
  supabaseSelect,
} from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

type CashExpenseAction =
  | "create"
  | "import"
  | "review_document"
  | "transition"
  | "update_allocation";

type CashExpenseBody = {
  action?: CashExpenseAction;
  allocationId?: string;
  allocations?: Array<{
    accountName?: string;
    amount?: number;
    costCenterName?: string;
    detail?: string;
    linkedModule?: LinkedModule;
    sourceCategory?: string;
    sourceSubcategory?: string;
  }>;
  document?: {
    cashboxName?: string;
    description?: string;
    documentDate?: string;
    documentNumber?: string;
    notes?: string;
    paymentMethod?: string;
    responsible?: string;
    supplier?: string;
  };
  documentId?: string;
  fileName?: string;
  payload?: unknown;
  status?: CashExpenseStatus;
  update?: {
    accountName?: string;
    costCenterName?: string;
    linkedModule?: LinkedModule;
  };
};

const linkedModules: LinkedModule[] = [
  "Ganadero",
  "Agricola",
  "Maquinarias",
  "Recursos Humanos",
  "Financiero",
  "Deposito",
  "General",
];

export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "lector");
  if (auth.error) return auth.error;

  const period = request.nextUrl.searchParams.get("period") ?? "";
  if (!isPeriod(period)) {
    return NextResponse.json(
      { error: "Seleccione un periodo mensual valido." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      accounts: [],
      batches: [],
      cashboxes: [],
      commerceRecords: [],
      costCenters: [],
      documents: [],
      storageMode: "demo",
    });
  }

  try {
    return NextResponse.json({
      ...(await loadCashExpenseBundle(period)),
      storageMode: "supabase",
    });
  } catch (error) {
    return cashExpenseError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "editor");
  if (auth.error) return auth.error;

  const body = (await request.json()) as CashExpenseBody;
  if (!body.action || !["create", "import"].includes(body.action)) {
    return NextResponse.json(
      { error: "La accion solicitada no es valida." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error: "Conecte Supabase para guardar comprobantes reales.",
        storageMode: "demo",
      },
      { status: 409 },
    );
  }

  try {
    if (body.action === "import") {
      if (!hasPermission(auth.user, "financiero", "administrador")) {
        return NextResponse.json(
          { error: "La importacion requiere permiso de administrador." },
          { status: 403 },
        );
      }
      const payloadError = validateLegacyPayload(body.payload);
      if (payloadError) {
        return NextResponse.json({ error: payloadError }, { status: 400 });
      }

      const normalizedPayload = body.payload as Record<string, unknown>;
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(normalizedPayload))
        .digest("hex");
      const rows = await supabaseInsert<Record<string, unknown>[]>(
        "rpc/finance_import_legacy_cash_backup",
        {
          p_file_name: clean(body.fileName) || "respaldo.json",
          p_fingerprint: fingerprint,
          p_imported_by_name: auth.user.fullName,
          p_payload: normalizedPayload,
        },
      );
      return NextResponse.json(
        {
          batch: cashExpenseImportBatchFromRow(rows[0] as never),
          storageMode: "supabase",
        },
        { status: 201 },
      );
    }

    const createError = validateCreateBody(body);
    if (createError) {
      return NextResponse.json({ error: createError }, { status: 400 });
    }

    const rows = await supabaseInsert<Record<string, unknown>[]>(
      "rpc/finance_cash_expense_create",
      {
        p_allocations: body.allocations,
        p_created_by_name: auth.user.fullName,
        p_document: body.document,
      },
    );
    return NextResponse.json(
      {
        document: cashExpenseDocumentFromRow(rows[0] as never),
        storageMode: "supabase",
      },
      { status: 201 },
    );
  } catch (error) {
    return cashExpenseError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "editor");
  if (auth.error) return auth.error;

  const body = (await request.json()) as CashExpenseBody;
  if (
    !body.action ||
    !["review_document", "transition", "update_allocation"].includes(body.action)
  ) {
    return NextResponse.json(
      { error: "La accion solicitada no es valida." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase no esta configurado." },
      { status: 409 },
    );
  }

  try {
    if (body.action === "review_document") {
      if (!body.documentId) {
        return NextResponse.json(
          { error: "Seleccione un comprobante." },
          { status: 400 },
        );
      }
      const result = await supabaseInsert<number>(
        "rpc/finance_cash_expense_review_document",
        { p_document_id: body.documentId },
      );
      return NextResponse.json({
        reviewed: Number(result),
        storageMode: "supabase",
      });
    }

    if (body.action === "update_allocation") {
      if (
        !body.allocationId ||
        !body.update ||
        !isLinkedModule(body.update.linkedModule) ||
        !clean(body.update.accountName) ||
        !clean(body.update.costCenterName)
      ) {
        return NextResponse.json(
          { error: "Complete la clasificacion de la distribucion." },
          { status: 400 },
        );
      }

      const rows = await supabaseInsert<Record<string, unknown>[]>(
        "rpc/finance_cash_expense_update_allocation",
        {
          p_account_name: clean(body.update.accountName),
          p_allocation_id: body.allocationId,
          p_cost_center_name: clean(body.update.costCenterName),
          p_linked_module: body.update.linkedModule,
        },
      );
      return NextResponse.json({
        allocation: cashExpenseAllocationFromRow(rows[0] as never),
        storageMode: "supabase",
      });
    }

    if (
      !hasPermission(auth.user, "financiero", "administrador") ||
      !body.documentId ||
      !["confirmado", "anulado"].includes(body.status ?? "")
    ) {
      return NextResponse.json(
        {
          error:
            "Se requiere permiso de administrador y un estado valido.",
        },
        { status: 403 },
      );
    }

    const rows = await supabaseInsert<Record<string, unknown>[]>(
      "rpc/finance_cash_expense_transition",
      {
        p_document_id: body.documentId,
        p_target_status: body.status,
      },
    );
    return NextResponse.json({
      document: cashExpenseDocumentFromRow(rows[0] as never),
      storageMode: "supabase",
    });
  } catch (error) {
    return cashExpenseError(error);
  }
}

async function loadCashExpenseBundle(period: string) {
  const nextPeriod = nextMonth(period);
  const documentRows = await supabaseSelect<Record<string, unknown>[]>(
    `finance_cash_expenses?document_date=gte.${period}-01&document_date=lt.${nextPeriod}-01&select=*&order=document_date.desc,created_at.desc`,
  );
  const documents = documentRows.map((row) =>
    cashExpenseDocumentFromRow(row as never),
  );
  let allocations: CashExpenseAllocation[] = [];

  if (documents.length) {
    const documentIds = documents.map((document) => document.id).join(",");
    const allocationRows = await supabaseSelect<Record<string, unknown>[]>(
      `finance_cash_expense_allocations?document_id=in.(${documentIds})&select=*&order=line_number.asc`,
    );
    allocations = allocationRows.map((row) =>
      cashExpenseAllocationFromRow(row as never),
    );
  }

  const [batchRows, commerceRows, cashboxRows, accountRows, costCenterRows] =
    await Promise.all([
      supabaseSelect<Record<string, unknown>[]>(
        "finance_import_batches?select=*&order=created_at.desc&limit=10",
      ),
      supabaseSelect<Record<string, unknown>[]>(
        "finance_imported_commerce?select=*&order=document_date.desc,created_at.desc",
      ),
      supabaseSelect<Record<string, unknown>[]>(
        "finance_cashboxes?active=eq.true&select=name&order=name.asc",
      ),
      supabaseSelect<Record<string, unknown>[]>(
        "finance_accounts?active=eq.true&select=name&order=name.asc",
      ),
      supabaseSelect<Record<string, unknown>[]>(
        "cost_centers?active=eq.true&select=name&order=name.asc",
      ),
    ]);

  const allocationsByDocument = new Map<string, CashExpenseAllocation[]>();
  allocations.forEach((allocation) => {
    const list = allocationsByDocument.get(allocation.documentId) ?? [];
    list.push(allocation);
    allocationsByDocument.set(allocation.documentId, list);
  });

  return {
    accounts: accountRows.map((row) => clean(row.name)).filter(Boolean),
    batches: batchRows.map((row) =>
      cashExpenseImportBatchFromRow(row as never),
    ),
    cashboxes: cashboxRows.map((row) => clean(row.name)).filter(Boolean),
    commerceRecords: commerceRows.map((row) =>
      importedCommerceRecordFromRow(row as never),
    ),
    costCenters: costCenterRows.map((row) => clean(row.name)).filter(Boolean),
    documents: documents.map((document) => ({
      ...document,
      allocations: allocationsByDocument.get(document.id) ?? [],
    })) satisfies CashExpenseDocument[],
  };
}

function validateLegacyPayload(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.expenses)) {
    return "El archivo no contiene una lista valida de gastos.";
  }
  if (!payload.expenses.length) return "El respaldo no contiene gastos.";
  if (payload.expenses.length > 2000) {
    return "El respaldo supera el limite de 2.000 comprobantes.";
  }
  if (
    payload.commerceRecords !== undefined &&
    !Array.isArray(payload.commerceRecords)
  ) {
    return "Las operaciones comerciales no tienen un formato valido.";
  }

  for (const expense of payload.expenses) {
    if (!isRecord(expense) || !isDate(expense.fecha)) {
      return "Existe un comprobante con fecha invalida.";
    }
    if (
      !Array.isArray(expense.allocations) ||
      !expense.allocations.length ||
      expense.allocations.length > 50
    ) {
      return "Cada comprobante debe contener entre 1 y 50 distribuciones.";
    }
    for (const allocation of expense.allocations) {
      if (
        !isRecord(allocation) ||
        !clean(allocation.category) ||
        !clean(allocation.subcategory) ||
        !isPositiveNumber(allocation.monto)
      ) {
        return "Una distribucion contiene datos incompletos o un monto invalido.";
      }
    }
  }
  return null;
}

function validateCreateBody(body: CashExpenseBody) {
  if (!body.document || !isDate(body.document.documentDate)) {
    return "Ingrese una fecha valida.";
  }
  if (!clean(body.document.cashboxName)) return "Seleccione una caja.";
  if (!clean(body.document.description)) return "Ingrese una descripcion.";
  if (!Array.isArray(body.allocations) || !body.allocations.length) {
    return "Agregue al menos una distribucion.";
  }
  for (const allocation of body.allocations) {
    if (
      !isPositiveNumber(allocation.amount) ||
      !isLinkedModule(allocation.linkedModule) ||
      !clean(allocation.accountName) ||
      !clean(allocation.costCenterName)
    ) {
      return "Complete correctamente todas las distribuciones.";
    }
  }
  return null;
}

function cashExpenseError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "No se pudo procesar el comprobante.";
  const migrationRequired =
    message.includes("finance_cash_expenses") ||
    message.includes("finance_cash_expense_allocations") ||
    message.includes("finance_import_batches") ||
    message.includes("finance_imported_commerce") ||
    message.includes("finance_import_legacy_cash_backup") ||
    message.includes("finance_cash_expense_create") ||
    message.includes("finance_cash_expense_update_allocation") ||
    message.includes("finance_cash_expense_review_document") ||
    message.includes("finance_cash_expense_transition") ||
    message.includes("PGRST205") ||
    message.includes("PGRST202");

  return NextResponse.json(
    {
      error: migrationRequired
        ? "Falta ejecutar la actualizacion de Gastos de caja en Supabase."
        : readableError(message),
      migrationRequired,
    },
    { status: migrationRequired ? 409 : 400 },
  );
}

function readableError(message: string) {
  if (message.includes("ya fue importado")) {
    return "Este respaldo ya fue importado anteriormente.";
  }
  if (message.includes("clasificacion")) {
    return "Revise la clasificacion de todas las distribuciones.";
  }
  if (message.includes("Solo se pueden")) {
    return message;
  }
  return message;
}

function nextMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function isPeriod(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function isPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function isLinkedModule(value: unknown): value is LinkedModule {
  return linkedModules.includes(value as LinkedModule);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}
