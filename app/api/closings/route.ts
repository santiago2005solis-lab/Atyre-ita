import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import {
  closingReportDefinitions,
  monthlyClosingFromRow,
  monthlyClosingItemFromRow,
  type MonthlyClosingItemStatus,
  type MonthlyClosingStatus,
} from "@/lib/monthly-closing";
import { hasPermission } from "@/lib/permissions";
import {
  isSupabaseConfigured,
  supabaseInsert,
  supabasePatch,
  supabaseSelect,
} from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

type ClosingBody = {
  action?: "update_item" | "update_notes" | "transition";
  closingId?: string;
  itemId?: string;
  nextMonthPending?: string;
  notes?: string;
  period?: string;
  responsibleName?: string;
  snapshot?: Record<string, unknown>;
  status?: MonthlyClosingItemStatus | MonthlyClosingStatus;
};

export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request, "cierres", "lector");
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
      closing: null,
      items: [],
      storageMode: "demo",
    });
  }

  try {
    return NextResponse.json({
      ...(await loadBundleByPeriod(period)),
      storageMode: "supabase",
    });
  } catch (error) {
    return closingError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAppUser(request, "cierres", "editor");
  if (auth.error) return auth.error;

  const body = (await request.json()) as ClosingBody;
  if (!isPeriod(body.period)) {
    return NextResponse.json(
      { error: "Seleccione un periodo mensual valido." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    const closingId = randomUUID();
    return NextResponse.json(
      {
        closing: monthlyClosingFromRow({
          created_at: new Date().toISOString(),
          created_by_name: auth.user.fullName,
          finance_snapshot: {},
          id: closingId,
          period_start: `${body.period}-01`,
          status: "abierto",
          updated_at: new Date().toISOString(),
        }),
        items: closingReportDefinitions.map((report) =>
          monthlyClosingItemFromRow({
            closing_id: closingId,
            id: randomUUID(),
            report_key: report.key,
            responsible_name: "",
            source_module: report.sourceModule,
            status: "pendiente",
            title: report.title,
            updated_at: new Date().toISOString(),
          }),
        ),
        storageMode: "demo",
      },
      { status: 201 },
    );
  }

  try {
    await supabaseInsert<Record<string, unknown>[]>(
      "rpc/monthly_closing_create",
      {
        p_created_by_name: auth.user.fullName,
        p_period_start: `${body.period}-01`,
      },
    );
    return NextResponse.json(
      {
        ...(await loadBundleByPeriod(body.period!)),
        storageMode: "supabase",
      },
      { status: 201 },
    );
  } catch (error) {
    return closingError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAppUser(request, "cierres", "editor");
  if (auth.error) return auth.error;

  const body = (await request.json()) as ClosingBody;
  if (
    !body.action ||
    !["update_item", "update_notes", "transition"].includes(body.action)
  ) {
    return NextResponse.json(
      { error: "La accion de cierre no es valida." },
      { status: 400 },
    );
  }

  const canAdmin = hasPermission(
    auth.user,
    "cierres",
    "administrador",
  );

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      action: body.action,
      storageMode: "demo",
    });
  }

  try {
    if (body.action === "update_item") {
      if (
        !body.itemId ||
        !isItemStatus(body.status)
      ) {
        return NextResponse.json(
          { error: "Seleccione el reporte y su estado." },
          { status: 400 },
        );
      }
      if (
        (body.status === "revisado" || body.status === "aprobado") &&
        !canAdmin
      ) {
        return NextResponse.json(
          {
            error:
              "Se requiere permiso de administrador para revisar o aprobar.",
          },
          { status: 403 },
        );
      }

      const itemRows = await supabaseSelect<Record<string, unknown>[]>(
        `monthly_closing_items?id=eq.${encodeURIComponent(
          body.itemId,
        )}&select=*&limit=1`,
      );
      if (!itemRows[0]) {
        return NextResponse.json(
          { error: "El reporte seleccionado ya no existe." },
          { status: 404 },
        );
      }
      const item = monthlyClosingItemFromRow(itemRows[0]);
      const closing = await loadClosingById(item.closingId);
      if (closing.status === "aprobado" || closing.status === "cerrado") {
        return NextResponse.json(
          { error: "El cierre ya no admite cambios en sus reportes." },
          { status: 409 },
        );
      }
      if (closing.status === "revision" && !canAdmin) {
        return NextResponse.json(
          {
            error:
              "La revision de reportes requiere permiso de administrador.",
          },
          { status: 403 },
        );
      }

      const rows = await supabasePatch<Record<string, unknown>[]>(
        `monthly_closing_items?id=eq.${encodeURIComponent(body.itemId)}`,
        {
          notes: clean(body.notes) || null,
          responsible_name: clean(body.responsibleName) || null,
          status: body.status,
          updated_at: new Date().toISOString(),
          updated_by_name: auth.user.fullName,
        },
      );
      return NextResponse.json({
        item: monthlyClosingItemFromRow(rows[0]),
        storageMode: "supabase",
      });
    }

    if (!body.closingId) {
      return NextResponse.json(
        { error: "Seleccione un cierre mensual." },
        { status: 400 },
      );
    }

    const closing = await loadClosingById(body.closingId);
    if (body.action === "update_notes") {
      if (closing.status === "aprobado" || closing.status === "cerrado") {
        return NextResponse.json(
          { error: "El cierre aprobado no admite cambios sin reabrirlo." },
          { status: 409 },
        );
      }
      const rows = await supabasePatch<Record<string, unknown>[]>(
        `monthly_closings?id=eq.${encodeURIComponent(body.closingId)}`,
        {
          next_month_pending: clean(body.nextMonthPending) || null,
          notes: clean(body.notes) || null,
          updated_at: new Date().toISOString(),
        },
      );
      return NextResponse.json({
        closing: monthlyClosingFromRow(rows[0]),
        storageMode: "supabase",
      });
    }

    if (!isClosingStatus(body.status)) {
      return NextResponse.json(
        { error: "Seleccione el estado de cierre." },
        { status: 400 },
      );
    }
    if (body.status !== "revision" && !canAdmin) {
      return NextResponse.json(
        {
          error:
            "Se requiere permiso de administrador para aprobar, cerrar o reabrir.",
        },
        { status: 403 },
      );
    }

    await supabaseInsert<Record<string, unknown>[]>(
      "rpc/monthly_closing_transition",
      {
        p_closing_id: body.closingId,
        p_finance_snapshot: body.snapshot ?? {},
        p_target_status: body.status,
        p_user_name: auth.user.fullName,
      },
    );
    return NextResponse.json({
      ...(await loadBundleByPeriod(closing.period)),
      storageMode: "supabase",
    });
  } catch (error) {
    return closingError(error);
  }
}

async function loadBundleByPeriod(period: string) {
  const rows = await supabaseSelect<Record<string, unknown>[]>(
    `monthly_closings?period_start=eq.${period}-01&select=*&limit=1`,
  );
  if (!rows[0]) return { closing: null, items: [] };
  const closing = monthlyClosingFromRow(rows[0]);
  const itemRows = await supabaseSelect<Record<string, unknown>[]>(
    `monthly_closing_items?closing_id=eq.${encodeURIComponent(
      closing.id,
    )}&select=*&order=report_number.asc`,
  );
  return {
    closing,
    items: itemRows.map(monthlyClosingItemFromRow),
  };
}

async function loadClosingById(id: string) {
  const rows = await supabaseSelect<Record<string, unknown>[]>(
    `monthly_closings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  if (!rows[0]) throw new Error("Cierre no encontrado.");
  return monthlyClosingFromRow(rows[0]);
}

function isPeriod(value: unknown): value is string {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(clean(value));
}

function isItemStatus(value: unknown): value is MonthlyClosingItemStatus {
  return (
    value === "pendiente" ||
    value === "preparado" ||
    value === "revisado" ||
    value === "aprobado"
  );
}

function isClosingStatus(value: unknown): value is MonthlyClosingStatus {
  return (
    value === "abierto" ||
    value === "revision" ||
    value === "aprobado" ||
    value === "cerrado"
  );
}

function clean(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function closingError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "No se pudo actualizar el cierre.";
  const migrationRequired =
    message.includes("monthly_closings") ||
    message.includes("monthly_closing_items") ||
    message.includes("monthly_closing_create") ||
    message.includes("monthly_closing_transition") ||
    message.includes("PGRST205") ||
    message.includes("PGRST202");

  return NextResponse.json(
    {
      error: migrationRequired
        ? "Falta ejecutar la actualizacion del modulo Cierres en Supabase."
        : readableError(message),
      migrationRequired,
    },
    { status: migrationRequired ? 409 : 400 },
  );
}

function readableError(message: string) {
  if (message.includes("Cierre no encontrado")) {
    return "El cierre seleccionado ya no existe.";
  }
  if (message.includes("reportes pendientes")) {
    return "Complete todos los reportes antes de enviar el cierre a revision.";
  }
  if (message.includes("reportes sin aprobar")) {
    return "Todos los reportes deben estar aprobados.";
  }
  if (message.includes("debe estar aprobado")) {
    return "El cierre debe estar aprobado antes de finalizarlo.";
  }
  return message;
}
