import { NextRequest, NextResponse } from "next/server";
import {
  cashboxes,
  costCenters,
  demoData,
  financeAccounts,
  warehouses,
  type AppData,
} from "@/lib/company-data";
import {
  financeMovementFromRow,
  inventoryItemFromRow,
  inventoryMovementFromRow,
} from "@/lib/db-mappers";
import { requireAppUser } from "@/lib/auth";
import { isSupabaseConfigured, supabaseSelect } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ...demoData, currentUser: auth.user });
  }

  try {
    const [
      financeRows,
      itemRows,
      movementRows,
      employeeRows,
      cashboxRows,
      accountRows,
      costCenterRows,
      warehouseRows,
    ] = await Promise.all([
      supabaseSelect<unknown[]>(
        "finance_movements?select=*&order=movement_date.desc,created_at.desc",
      ),
      supabaseSelect<unknown[]>(
        "inventory_items?select=*&order=warehouse_name.asc,name.asc",
      ),
      supabaseSelect<unknown[]>(
        "inventory_movements?select=*&order=movement_date.desc,created_at.desc",
      ),
      supabaseSelect<unknown[]>(
        "hr_employees?select=*&order=full_name.asc",
      ),
      supabaseSelect<unknown[]>(
        "finance_cashboxes?active=eq.true&select=name&order=name.asc",
      ),
      supabaseSelect<unknown[]>(
        "finance_accounts?active=eq.true&postable=eq.true&select=name&order=code.asc.nullslast,name.asc",
      ),
      supabaseSelect<unknown[]>(
        "cost_centers?active=eq.true&select=name&order=name.asc",
      ),
      supabaseSelect<unknown[]>(
        "inventory_warehouses?active=eq.true&select=name&order=name.asc",
      ),
    ]);

    const data: AppData = {
      storageMode: "supabase",
      storageMessage: "Conectado a Supabase.",
      currentUser: auth.user,
      cashboxes: mergeNames(cashboxRows, cashboxes),
      costCenters: mergeNames(costCenterRows, costCenters),
      financeAccounts: mergeNames(accountRows, financeAccounts),
      warehouses: mergeNames(warehouseRows, warehouses),
      financeMovements: financeRows.map((row) => financeMovementFromRow(row as never)),
      inventoryItems: itemRows.map((row) => inventoryItemFromRow(row as never)),
      inventoryMovements: movementRows.map((row) => inventoryMovementFromRow(row as never)),
      hrEmployees: employeeRows.map((row) => ({
        id: String((row as { id: string }).id),
        fullName: String((row as { full_name: string }).full_name),
        documentNumber: String((row as { document_number?: string }).document_number ?? ""),
        role: String((row as { role?: string }).role ?? ""),
        department: String((row as { department?: string }).department ?? ""),
        status: ((row as { status?: "activo" | "licencia" | "inactivo" }).status ?? "activo"),
        startDate: String((row as { start_date?: string }).start_date ?? ""),
        salaryType:
          (row as { salary_type?: "mensual" | "jornal" }).salary_type === "jornal"
            ? "jornal"
            : "mensual",
        monthlySalary: Number((row as { monthly_salary?: number | string }).monthly_salary ?? 0),
        dailyWage: Number((row as { daily_wage?: number | string }).daily_wage ?? 0),
        notes: String((row as { notes?: string }).notes ?? ""),
      })),
    };

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({
      ...demoData,
      currentUser: auth.user,
      storageError:
        error instanceof Error
          ? error.message
          : "No se pudo leer Supabase. Se muestran datos demo.",
    });
  }
}

function mergeNames(rows: unknown[], fallback: string[]) {
  return Array.from(
    new Set([
      ...rows
        .map((row) =>
          String((row as { name?: unknown }).name ?? "").trim(),
        )
        .filter(Boolean),
      ...fallback,
    ]),
  ).sort((left, right) => left.localeCompare(right, "es"));
}
