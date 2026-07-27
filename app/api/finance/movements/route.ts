import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { FinanceMovement } from "@/lib/company-data";
import {
  financeMovementFromRow,
  financeMovementToRow,
} from "@/lib/db-mappers";
import { requireAppUser } from "@/lib/auth";
import {
  isSupabaseConfigured,
  supabaseDelete,
  supabaseInsert,
  supabasePatch,
  supabaseSelect,
} from "@/lib/supabase-rest";
import { hasPermission } from "@/lib/permissions";
import { isExampleFinanceMovement } from "@/lib/finance-examples";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "lector");
  if (auth.error) return auth.error;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ movements: [], storageMode: "demo" });
  }

  const rows = await supabaseSelect<unknown[]>(
    "finance_movements?select=*&order=movement_date.desc,created_at.desc",
  );

  return NextResponse.json({
    movements: rows.map((row) => financeMovementFromRow(row as never)),
    storageMode: "supabase",
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "editor");
  if (auth.error) return auth.error;

  const body = (await request.json()) as Partial<FinanceMovement>;
  const validationError = validateMovement(body);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const requestedStatus = body.status ?? "borrador";
  const canApprove = hasPermission(
    auth.user ?? undefined,
    "financiero",
    "administrador",
  );

  if (requestedStatus === "anulado") {
    return NextResponse.json(
      { error: "Un movimiento nuevo no puede crearse como anulado." },
      { status: 400 },
    );
  }

  if (requestedStatus === "confirmado" && !canApprove) {
    return NextResponse.json(
      { error: "Se requiere permiso de administrador para confirmar." },
      { status: 403 },
    );
  }

  const payload = {
    accountName: body.accountName!,
    cashboxName: body.cashboxName!,
    costCenterName: body.costCenterName!,
    movementType: body.movementType!,
    movementDate: body.movementDate!,
    concept: body.concept!.trim(),
    category: body.category!,
    amount: Number(body.amount),
    currency: "PYG" as const,
    linkedModule: body.linkedModule!,
    paymentMethod: body.paymentMethod ?? "",
    documentNumber: body.documentNumber ?? "",
    responsible: body.responsible ?? "",
    relatedParty: body.relatedParty ?? "",
    sourceModule: body.sourceModule ?? "manual",
    status: requestedStatus,
    notes: body.notes ?? "",
  };

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        movement: {
          ...payload,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
        },
        storageMode: "demo",
      },
      { status: 201 },
    );
  }

  const rows = await supabaseInsert<unknown[]>(
    "finance_movements",
    financeMovementToRow(payload),
  );

  return NextResponse.json(
    {
      movement: financeMovementFromRow(rows[0] as never),
      storageMode: "supabase",
    },
    { status: 201 },
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "editor");
  if (auth.error) return auth.error;

  const body = (await request.json()) as {
    id?: string;
    status?: FinanceMovement["status"];
  };
  const allowedStatuses: FinanceMovement["status"][] = [
    "borrador",
    "pendiente",
    "confirmado",
    "anulado",
  ];

  if (!body.id || !body.status || !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Movimiento o estado no valido." }, { status: 400 });
  }

  const canApprove = hasPermission(
    auth.user ?? undefined,
    "financiero",
    "administrador",
  );

  if (
    (body.status === "confirmado" || body.status === "anulado") &&
    !canApprove
  ) {
    return NextResponse.json(
      { error: "Se requiere permiso de administrador para confirmar o anular." },
      { status: 403 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      id: body.id,
      status: body.status,
      storageMode: "demo",
    });
  }

  const currentRows = await supabaseSelect<unknown[]>(
    `finance_movements?id=eq.${encodeURIComponent(body.id)}&select=*&limit=1`,
  );
  const currentMovement = currentRows[0]
    ? financeMovementFromRow(currentRows[0] as never)
    : null;

  if (!currentMovement) {
    return NextResponse.json({ error: "Movimiento no encontrado." }, { status: 404 });
  }

  const validTransition =
    (currentMovement.status === "borrador" && body.status === "pendiente") ||
    (canApprove &&
      currentMovement.status === "pendiente" &&
      (body.status === "confirmado" || body.status === "anulado")) ||
    (canApprove &&
      currentMovement.status === "confirmado" &&
      body.status === "anulado");

  if (!validTransition) {
    return NextResponse.json(
      { error: "El cambio de estado solicitado no esta permitido." },
      { status: 409 },
    );
  }

  const rows = await supabasePatch<unknown[]>(
    `finance_movements?id=eq.${encodeURIComponent(body.id)}`,
    { status: body.status },
  );

  return NextResponse.json({
    movement: financeMovementFromRow(rows[0] as never),
    storageMode: "supabase",
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAppUser(request, "financiero", "administrador");
  if (auth.error) return auth.error;

  const body = (await request.json()) as {
    confirmation?: string;
    ids?: string[];
  };
  const ids = Array.from(
    new Set(
      (body.ids ?? [])
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );

  if (body.confirmation !== "ELIMINAR") {
    return NextResponse.json(
      { error: "La confirmacion de seguridad no es valida." },
      { status: 400 },
    );
  }
  if (!ids.length || ids.length > 20) {
    return NextResponse.json(
      { error: "Seleccione entre 1 y 20 registros de ejemplo." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ deletedIds: ids, storageMode: "demo" });
  }

  if (ids.some((id) => !isUuid(id))) {
    return NextResponse.json(
      { error: "Uno de los movimientos seleccionados no es valido." },
      { status: 400 },
    );
  }

  const rows = await supabaseSelect<unknown[]>(
    `finance_movements?id=in.(${ids.join(",")})&select=*`,
  );
  const movements = rows.map((row) => financeMovementFromRow(row as never));

  if (movements.length !== ids.length) {
    return NextResponse.json(
      { error: "Uno de los movimientos ya no existe. Actualice la pantalla." },
      { status: 409 },
    );
  }
  if (movements.some((movement) => !isExampleFinanceMovement(movement))) {
    return NextResponse.json(
      {
        error:
          "La seleccion contiene un movimiento que no fue creado como ejemplo.",
      },
      { status: 403 },
    );
  }

  const deletedRows = await supabaseDelete<unknown[]>(
    `finance_movements?id=in.(${ids.join(",")})`,
  );
  const deletedIds = deletedRows.map((row) =>
    String((row as { id?: string }).id ?? ""),
  );

  return NextResponse.json({
    deletedIds,
    storageMode: "supabase",
  });
}

function validateMovement(body: Partial<FinanceMovement>) {
  if (!body.cashboxName) return "Seleccione una caja.";
  if (!body.movementType) return "Seleccione el tipo de movimiento.";
  if (!body.movementDate) return "Ingrese la fecha.";
  if (!body.concept?.trim()) return "Ingrese el concepto.";
  if (!body.category) return "Seleccione una categoria.";
  if (!body.accountName) return "Seleccione una cuenta contable.";
  if (!body.costCenterName) return "Seleccione un centro de costo.";
  if (!body.linkedModule) return "Seleccione el modulo vinculado.";
  if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) {
    return "Ingrese un monto valido.";
  }
  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
