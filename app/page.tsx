"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  cashboxes,
  demoData,
  linkedModules,
  financeCategories,
  inventoryCategories,
  inventoryUnits,
  paymentMethods,
  warehouses,
  type AppData,
  type FinanceMovement,
  type FinanceMovementStatus,
  type FinanceMovementType,
  type LinkedModule,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementType,
} from "@/lib/company-data";
import {
  canEditModule,
  canReadModule,
  hasPermission,
  type AppModule,
} from "@/lib/permissions";
import { FinanceRecordMaintenance } from "@/app/components/finance-example-cleanup";
import { FinanceObligationsPanel } from "@/app/components/finance-obligations-panel";
import { CashExpensesPanel } from "@/app/components/cash-expenses-panel";
import { HumanResourcesModule } from "@/app/components/human-resources-module";
import { MonthlyClosingModule } from "@/app/components/monthly-closing-module";

type ProtectedModuleId = Extract<
  AppModule,
  | "ganadero"
  | "agricola"
  | "maquinarias"
  | "rrhh"
  | "financiero"
  | "deposito"
  | "cierres"
>;
type ModuleId = "inicio" | ProtectedModuleId;
type SavingTarget = "finance" | "item" | "inventory-movement" | null;
type FinanceBlockId =
  | "resumen"
  | "cajas"
  | "movimientos"
  | "gastos-caja"
  | "plan-cuentas"
  | "centros-costo"
  | "pagar"
  | "cobrar"
  | "reportes"
  | "configuracion";

type DashboardActivity = {
  amount?: number;
  date: string;
  detail: string;
  id: string;
  module: string;
  title: string;
  tone?: "negative" | "positive";
};

type FinanceForm = {
  accountName: string;
  amount: string;
  cashboxName: string;
  category: string;
  concept: string;
  costCenterName: string;
  documentNumber: string;
  linkedModule: LinkedModule;
  movementDate: string;
  movementType: FinanceMovementType;
  notes: string;
  paymentMethod: string;
  relatedParty: string;
  responsible: string;
  sourceModule: string;
  status: FinanceMovementStatus;
};

type ItemForm = {
  category: string;
  currentStock: string;
  minStock: string;
  name: string;
  sku: string;
  supplier: string;
  unit: string;
  unitCost: string;
  warehouseName: string;
};

type InventoryMovementForm = {
  documentNumber: string;
  itemId: string;
  movementDate: string;
  movementType: InventoryMovementType;
  notes: string;
  quantity: string;
  responsible: string;
  targetWarehouseName: string;
  unitCost: string;
};

const today = new Date().toISOString().slice(0, 10);

const initialFinanceForm: FinanceForm = {
  accountName: demoData.financeAccounts[0],
  amount: "",
  cashboxName: cashboxes[0],
  category: financeCategories[0],
  concept: "",
  costCenterName: demoData.costCenters[0],
  documentNumber: "",
  linkedModule: "Ganadero",
  movementDate: today,
  movementType: "ingreso",
  notes: "",
  paymentMethod: paymentMethods[1],
  relatedParty: "",
  responsible: "",
  sourceModule: "manual",
  status: "borrador",
};

const initialItemForm: ItemForm = {
  category: inventoryCategories[0],
  currentStock: "",
  minStock: "",
  name: "",
  sku: "",
  supplier: "",
  unit: inventoryUnits[0],
  unitCost: "",
  warehouseName: warehouses[0],
};

const initialInventoryMovementForm: InventoryMovementForm = {
  documentNumber: "",
  itemId: demoData.inventoryItems[0]?.id ?? "",
  movementDate: today,
  movementType: "entrada",
  notes: "",
  quantity: "",
  responsible: "",
  targetWarehouseName: warehouses[1],
  unitCost: "",
};

const protectedModuleDefinitions: Array<{ id: ProtectedModuleId; label: string; mark: string }> = [
  { id: "ganadero", label: "Ganadero", mark: "G" },
  { id: "agricola", label: "Agricola", mark: "A" },
  { id: "maquinarias", label: "Maquinarias", mark: "M" },
  { id: "rrhh", label: "Recursos Humanos", mark: "RH" },
  { id: "financiero", label: "Financiero", mark: "FI" },
  { id: "deposito", label: "Deposito", mark: "D" },
  { id: "cierres", label: "Cierres", mark: "CM" },
];

const homeModule = { id: "inicio" as const, label: "Inicio", mark: "IN" };

const financeBlockDefinitions: Array<{ id: FinanceBlockId; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "cajas", label: "Cajas" },
  { id: "movimientos", label: "Movimientos" },
  { id: "gastos-caja", label: "Gastos de caja" },
  { id: "plan-cuentas", label: "Plan de cuentas" },
  { id: "centros-costo", label: "Centros de costo" },
  { id: "pagar", label: "Cuentas por pagar" },
  { id: "cobrar", label: "Cuentas por cobrar" },
  { id: "reportes", label: "Reportes" },
  { id: "configuracion", label: "Configuracion" },
];

export default function AppPage() {
  const [activeModule, setActiveModule] = useState<ModuleId>("inicio");
  const [data, setData] = useState<AppData>(demoData);
  const [financeForm, setFinanceForm] = useState<FinanceForm>(initialFinanceForm);
  const [itemForm, setItemForm] = useState<ItemForm>(initialItemForm);
  const [movementForm, setMovementForm] = useState<InventoryMovementForm>(
    initialInventoryMovementForm,
  );
  const [selectedCashbox, setSelectedCashbox] = useState("Todas");
  const [selectedCostCenter, setSelectedCostCenter] = useState("Todos");
  const [selectedFinanceAccount, setSelectedFinanceAccount] = useState("Todas");
  const [selectedFinanceModule, setSelectedFinanceModule] = useState("Todos");
  const [selectedFinanceStatus, setSelectedFinanceStatus] = useState("Todos");
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const [selectedWarehouse, setSelectedWarehouse] = useState("Todos");
  const [saving, setSaving] = useState<SavingTarget>(null);
  const [updatingMovementId, setUpdatingMovementId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Cargando datos del sistema...");

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        let response = await fetch("/api/bootstrap", { cache: "no-store" });
        if (response.status === 401) {
          const refreshResponse = await fetch("/api/auth/refresh", {
            method: "POST",
          });

          if (refreshResponse.ok) {
            response = await fetch("/api/bootstrap", { cache: "no-store" });
          }
        }

        if (response.status === 401) {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.replace("/login");
          return;
        }

        const payload = (await response.json()) as AppData;
        if (!response.ok) {
          throw new Error(payload.storageError ?? "No se pudo cargar el sistema.");
        }
        if (!isMounted) return;
        setData(payload);
        setStatusMessage(payload.storageMessage ?? "Datos cargados.");
      } catch {
        if (!isMounted) return;
        setData(demoData);
        setStatusMessage("Modo demo activo.");
      }
    }

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleModules = useMemo(
    () =>
      data.currentUser
        ? [
            homeModule,
            ...protectedModuleDefinitions.filter((module) =>
              canReadModule(data.currentUser, module.id),
            ),
          ]
        : [homeModule, ...protectedModuleDefinitions],
    [data.currentUser],
  );

  const effectiveActiveModule =
    data.currentUser &&
    activeModule !== "inicio" &&
    !canReadModule(data.currentUser, activeModule)
      ? "inicio"
      : activeModule;
  const canEditFinance = canEditModule(data.currentUser, "financiero");
  const canApproveFinance = hasPermission(
    data.currentUser,
    "financiero",
    "administrador",
  );
  const canEditDeposito = canEditModule(data.currentUser, "deposito");
  const activeModuleTitle =
    effectiveActiveModule === "inicio"
      ? "Atyrenita SG"
      : (protectedModuleDefinitions.find((module) => module.id === effectiveActiveModule)
          ?.label ?? "Atyrenita SG");

  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-PY", {
        currency: "PYG",
        maximumFractionDigits: 0,
        style: "currency",
      }),
    [],
  );

  const money = (value: number) => moneyFormatter.format(value).replace("PYG", "Gs.");

  const financeReport = useMemo(() => {
    const workflow = data.financeMovements.filter((movement) => {
      const byCashbox = selectedCashbox === "Todas" || movement.cashboxName === selectedCashbox;
      const byCostCenter =
        selectedCostCenter === "Todos" || movement.costCenterName === selectedCostCenter;
      const byAccount =
        selectedFinanceAccount === "Todas" || movement.accountName === selectedFinanceAccount;
      const byModule =
        selectedFinanceModule === "Todos" || movement.linkedModule === selectedFinanceModule;
      const byMonth = !selectedMonth || movement.movementDate.startsWith(selectedMonth);
      return byCashbox && byCostCenter && byAccount && byModule && byMonth;
    });
    const filtered = workflow.filter(
      (movement) =>
        selectedFinanceStatus === "Todos" || movement.status === selectedFinanceStatus,
    );

    const confirmedFiltered = filtered.filter((movement) => movement.status === "confirmado");
    const income = filtered
      .filter(
        (movement) =>
          movement.status === "confirmado" && movement.movementType === "ingreso",
      )
      .reduce((sum, movement) => sum + movement.amount, 0);
    const expense = filtered
      .filter(
        (movement) =>
          movement.status === "confirmado" && movement.movementType === "egreso",
      )
      .reduce((sum, movement) => sum + movement.amount, 0);
    const transfer = filtered
      .filter(
        (movement) =>
          movement.status === "confirmado" && movement.movementType === "transferencia",
      )
      .reduce((sum, movement) => sum + movement.amount, 0);

    return {
      balance: income - expense,
      expense,
      filtered,
      income,
      transfer,
      activeCount: confirmedFiltered.length,
      workflow,
    };
  }, [
    data.financeMovements,
    selectedCashbox,
    selectedCostCenter,
    selectedFinanceAccount,
    selectedFinanceModule,
    selectedFinanceStatus,
    selectedMonth,
  ]);

  const cashboxSummaries = useMemo(() => {
    return data.cashboxes.map((cashbox) => {
      const movements = data.financeMovements.filter(
        (movement) =>
          movement.cashboxName === cashbox && movement.status === "confirmado",
      );
      const income = movements
        .filter((movement) => movement.movementType === "ingreso")
        .reduce((sum, movement) => sum + movement.amount, 0);
      const expense = movements
        .filter((movement) => movement.movementType === "egreso")
        .reduce((sum, movement) => sum + movement.amount, 0);
      const transfer = movements
        .filter((movement) => movement.movementType === "transferencia")
        .reduce((sum, movement) => sum + movement.amount, 0);

      return {
        balance: income - expense,
        cashbox,
        expense,
        income,
        transfer,
      };
    });
  }, [data.cashboxes, data.financeMovements]);

  const inventoryReport = useMemo(() => {
    const filteredItems = data.inventoryItems.filter(
      (item) => selectedWarehouse === "Todos" || item.warehouseName === selectedWarehouse,
    );
    const value = filteredItems.reduce(
      (sum, item) => sum + item.currentStock * item.unitCost,
      0,
    );
    const lowStock = filteredItems.filter((item) => item.currentStock <= item.minStock);

    const byWarehouse = data.warehouses.map((warehouse) => {
      const items = data.inventoryItems.filter((item) => item.warehouseName === warehouse);
      const stockValue = items.reduce(
        (sum, item) => sum + item.currentStock * item.unitCost,
        0,
      );
      return {
        items,
        lowStock: items.filter((item) => item.currentStock <= item.minStock).length,
        stockValue,
        warehouse,
      };
    });

    return {
      byWarehouse,
      filteredItems,
      lowStock,
      value,
    };
  }, [data.inventoryItems, data.warehouses, selectedWarehouse]);
  const selectedItem =
    inventoryReport.filteredItems.find((item) => item.id === movementForm.itemId) ??
    inventoryReport.filteredItems[0];

  const latestActivities = useMemo<DashboardActivity[]>(() => {
    const itemNames = new Map(data.inventoryItems.map((item) => [item.id, item.name]));
    const activities: DashboardActivity[] = [];

    if (canReadModule(data.currentUser, "financiero")) {
      activities.push(
        ...data.financeMovements.map((movement) => ({
          amount: movement.amount,
          date: movement.createdAt || movement.movementDate,
          detail: `${movement.linkedModule} | ${movement.accountName} | ${movement.costCenterName}`,
          id: `finance-${movement.id}`,
          module: "Financiero",
          title: movement.concept,
          tone: movement.movementType === "egreso" ? ("negative" as const) : ("positive" as const),
        })),
      );
    }

    if (canReadModule(data.currentUser, "deposito")) {
      activities.push(
        ...data.inventoryMovements.map((movement) => ({
          amount: movement.quantity * movement.unitCost,
          date: movement.createdAt || movement.movementDate,
          detail: `${movement.movementType} | ${movement.warehouseName}`,
          id: `inventory-${movement.id}`,
          module: "Deposito",
          title: itemNames.get(movement.itemId) ?? "Movimiento de stock",
          tone:
            movement.movementType === "entrada" || movement.movementType === "ajuste"
              ? ("positive" as const)
              : ("negative" as const),
        })),
      );
    }

    if (canReadModule(data.currentUser, "rrhh")) {
      activities.push(
        ...data.hrEmployees.map((employee) => ({
          amount:
            employee.salaryType === "jornal"
              ? employee.dailyWage
              : employee.monthlySalary,
          date: employee.startDate,
          detail: `${employee.department} | ${employee.salaryType} | ${employee.status}`,
          id: `hr-${employee.id}`,
          module: "Recursos Humanos",
          title: employee.fullName,
          tone: "positive" as const,
        })),
      );
    }

    return activities
      .sort((first, second) => getTimeValue(second.date) - getTimeValue(first.date))
      .slice(0, 8);
  }, [
    data.currentUser,
    data.financeMovements,
    data.hrEmployees,
    data.inventoryItems,
    data.inventoryMovements,
  ]);

  async function submitFinanceMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditFinance) {
      setStatusMessage("Su usuario no puede cargar movimientos en Financiero.");
      return;
    }
    setSaving("finance");

    try {
      const response = await fetch("/api/finance/movements", {
        body: JSON.stringify({
          ...financeForm,
          amount: Number(financeForm.amount),
          currency: "PYG",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");

      setData((current) => ({
        ...current,
        financeMovements: [payload.movement as FinanceMovement, ...current.financeMovements],
        storageMode: payload.storageMode ?? current.storageMode,
      }));
      setFinanceForm((current) => ({
        ...initialFinanceForm,
        accountName: current.accountName,
        cashboxName: current.cashboxName,
        costCenterName: current.costCenterName,
        linkedModule: current.linkedModule,
        movementDate: current.movementDate,
        paymentMethod: current.paymentMethod,
      }));
      setStatusMessage(
        payload.storageMode === "supabase"
          ? "Movimiento guardado en Supabase."
          : "Movimiento agregado en modo demo.",
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(null);
    }
  }

  async function refreshFinanceMovements() {
    const response = await fetch("/api/finance/movements", {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      error?: string;
      movements?: FinanceMovement[];
      storageMode?: AppData["storageMode"];
    };

    if (!response.ok || !payload.movements) {
      throw new Error(
        payload.error ?? "No se pudieron actualizar los movimientos financieros.",
      );
    }

    setData((current) => ({
      ...current,
      financeMovements: payload.movements ?? current.financeMovements,
      storageMode: payload.storageMode ?? current.storageMode,
    }));
  }

  async function updateFinanceMovementStatus(
    movementId: string,
    status: FinanceMovementStatus,
  ) {
    if (!canEditFinance) {
      setStatusMessage("Su usuario no puede modificar movimientos financieros.");
      return;
    }

    const currentMovement = data.financeMovements.find(
      (movement) => movement.id === movementId,
    );

    if (
      status === "anulado" &&
      !window.confirm(
        "¿Desea anular este movimiento? Dejara de afectar los saldos y reportes.",
      )
    ) {
      return;
    }

    if (
      currentMovement?.status === "anulado" &&
      status === "confirmado" &&
      !window.confirm(
        "¿Desea reactivar este movimiento? Volvera a afectar la caja y los reportes.",
      )
    ) {
      return;
    }

    setUpdatingMovementId(movementId);

    try {
      const response = await fetch("/api/finance/movements", {
        body: JSON.stringify({ id: movementId, status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error ?? "No se pudo actualizar.");

      setData((current) => ({
        ...current,
        financeMovements: current.financeMovements.map((movement) =>
          movement.id === movementId
            ? payload.movement ?? { ...movement, status }
            : movement,
        ),
        storageMode: payload.storageMode ?? current.storageMode,
      }));
      setStatusMessage(`Movimiento actualizado a ${status}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "No se pudo actualizar.");
    } finally {
      setUpdatingMovementId(null);
    }
  }

  function removeFinanceMovements(movementIds: string[]) {
    setData((current) => ({
      ...current,
      financeMovements: current.financeMovements.filter(
        (movement) => !movementIds.includes(movement.id),
      ),
    }));
    setStatusMessage(
      `${movementIds.length} registro${
        movementIds.length === 1 ? "" : "s"
      } eliminado${movementIds.length === 1 ? "" : "s"}.`,
    );
  }

  function replaceFinanceMovement(updatedMovement: FinanceMovement) {
    setData((current) => ({
      ...current,
      financeMovements: current.financeMovements.map((movement) =>
        movement.id === updatedMovement.id ? updatedMovement : movement,
      ),
    }));
    setStatusMessage("Registro financiero actualizado.");
  }

  async function submitInventoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditDeposito) {
      setStatusMessage("Su usuario no puede cargar articulos en Deposito.");
      return;
    }
    setSaving("item");

    try {
      const response = await fetch("/api/inventory/items", {
        body: JSON.stringify({
          ...itemForm,
          currentStock: Number(itemForm.currentStock),
          minStock: Number(itemForm.minStock || 0),
          unitCost: Number(itemForm.unitCost || 0),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");

      setData((current) => ({
        ...current,
        inventoryItems: [...current.inventoryItems, payload.item as InventoryItem],
        storageMode: payload.storageMode ?? current.storageMode,
      }));
      setItemForm((current) => ({
        ...initialItemForm,
        warehouseName: current.warehouseName,
      }));
      setStatusMessage(
        payload.storageMode === "supabase"
          ? "Articulo guardado en Supabase."
          : "Articulo agregado en modo demo.",
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(null);
    }
  }

  async function submitInventoryMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    if (!canEditDeposito) {
      setStatusMessage("Su usuario no puede cargar movimientos en Deposito.");
      return;
    }
    setSaving("inventory-movement");

    try {
      const response = await fetch("/api/inventory/movements", {
        body: JSON.stringify({
          ...movementForm,
          itemId: selectedItem.id,
          quantity: Number(movementForm.quantity),
          unitCost: Number(movementForm.unitCost || selectedItem.unitCost),
          warehouseName: selectedItem.warehouseName,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");

      const movement = payload.movement as InventoryMovement;
      const updatedItem =
        (payload.item as InventoryItem | undefined) ??
        calculateLocalStock(selectedItem, movement.movementType, movement.quantity);

      setData((current) => ({
        ...current,
        inventoryItems: current.inventoryItems.map((item) =>
          item.id === updatedItem.id ? updatedItem : item,
        ),
        inventoryMovements: [movement, ...current.inventoryMovements],
        storageMode: payload.storageMode ?? current.storageMode,
      }));
      setMovementForm((current) => ({
        ...initialInventoryMovementForm,
        itemId: current.itemId,
        movementDate: current.movementDate,
      }));
      setStatusMessage(
        payload.storageMode === "supabase"
          ? "Movimiento de deposito guardado en Supabase."
          : "Movimiento de deposito agregado en modo demo.",
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(null);
    }
  }

  function exportFinanceCsv() {
    const headers = [
      "Fecha",
      "Caja",
      "Modulo vinculado",
      "Cuenta contable",
      "Centro de costo",
      "Tipo",
      "Estado",
      "Origen",
      "Concepto",
      "Categoria",
      "Monto",
      "Medio",
      "Comprobante",
      "Responsable",
      "Contraparte",
      "Notas",
    ];
    const rows = financeReport.filtered.map((movement) => [
      movement.movementDate,
      movement.cashboxName,
      movement.linkedModule,
      movement.accountName,
      movement.costCenterName,
      movement.movementType,
      movement.status,
      movement.sourceModule,
      movement.concept,
      movement.category,
      String(movement.amount),
      movement.paymentMethod,
      movement.documentNumber,
      movement.responsible,
      movement.relatedParty,
      movement.notes,
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-financiero-${selectedMonth || "todo"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegacion principal">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            SG
          </div>
          <div>
            <p className="eyebrow">Sistema empresarial</p>
            <h1>Atyrenita SG</h1>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="Modulos">
          {visibleModules.map((module) => (
            <button
              aria-pressed={effectiveActiveModule === module.id}
              className={effectiveActiveModule === module.id ? "active" : ""}
              key={module.id}
              onClick={() => setActiveModule(module.id)}
              type="button"
            >
              <span aria-hidden="true">{module.mark}</span>
              {module.label}
            </button>
          ))}
        </nav>

        {data.currentUser && (
          <div className="sidebar-summary">
            <p>Usuario</p>
            <strong>{data.currentUser.fullName}</strong>
            <span>{data.currentUser.role}</span>
            <button className="sidebar-logout" onClick={logout} type="button">
              Salir
            </button>
          </div>
        )}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{activeModuleTitle}</h2>
          </div>
          <div className="topbar-status">
            <div
              className={`connection-pill ${
                data.storageMode === "supabase" && !data.storageError ? "online" : "offline"
              }`}
            >
              <span aria-hidden="true" />
              {data.storageMode === "supabase" && !data.storageError ? "Online" : "Offline"}
            </div>
          </div>
        </header>

        {data.storageError && <div className="status-banner danger">{data.storageError}</div>}
        <p className="sr-only" aria-live="polite">
          {statusMessage}
        </p>

        {visibleModules.length === 1 && data.currentUser && (
          <section className="panel">
            <PanelHeading eyebrow="Acceso" title="Sin modulos asignados" />
            <p className="muted-text">
              Su usuario esta activo, pero todavia no tiene permisos asignados.
            </p>
          </section>
        )}

        {effectiveActiveModule === "inicio" && (
          <DashboardModule
            canReadAgricola={canReadModule(data.currentUser, "agricola")}
            canReadDeposito={canReadModule(data.currentUser, "deposito")}
            canReadCierres={canReadModule(data.currentUser, "cierres")}
            canReadFinance={canReadModule(data.currentUser, "financiero")}
            canReadGanadero={canReadModule(data.currentUser, "ganadero")}
            canReadMaquinarias={canReadModule(data.currentUser, "maquinarias")}
            canReadRrhh={canReadModule(data.currentUser, "rrhh")}
            data={data}
            financeReport={financeReport}
            inventoryReport={inventoryReport}
            latestActivities={latestActivities}
            money={money}
            setActiveModule={setActiveModule}
          />
        )}

        {effectiveActiveModule === "financiero" &&
          canReadModule(data.currentUser, "financiero") && (
          <FinanceModule
            canApprove={canApproveFinance}
            canEdit={canEditFinance}
            cashboxSummaries={cashboxSummaries}
            costCenters={data.costCenters}
            exportFinanceCsv={exportFinanceCsv}
            financeAccounts={data.financeAccounts}
            financeForm={financeForm}
            financeMovements={data.financeMovements}
            financeReport={financeReport}
            money={money}
            onMovementsDeleted={removeFinanceMovements}
            onMovementUpdated={replaceFinanceMovement}
            refreshFinanceMovements={refreshFinanceMovements}
            saving={saving}
            selectedCashbox={selectedCashbox}
            selectedCostCenter={selectedCostCenter}
            selectedFinanceAccount={selectedFinanceAccount}
            selectedFinanceModule={selectedFinanceModule}
            selectedFinanceStatus={selectedFinanceStatus}
            selectedMonth={selectedMonth}
            setFinanceForm={setFinanceForm}
            setSelectedCashbox={setSelectedCashbox}
            setSelectedCostCenter={setSelectedCostCenter}
            setSelectedFinanceAccount={setSelectedFinanceAccount}
            setSelectedFinanceModule={setSelectedFinanceModule}
            setSelectedFinanceStatus={setSelectedFinanceStatus}
            setSelectedMonth={setSelectedMonth}
            submitFinanceMovement={submitFinanceMovement}
            updateFinanceMovementStatus={updateFinanceMovementStatus}
            updatingMovementId={updatingMovementId}
          />
        )}

        {effectiveActiveModule === "deposito" && canReadModule(data.currentUser, "deposito") && (
          <InventoryModule
            canEdit={canEditDeposito}
            inventoryReport={inventoryReport}
            itemForm={itemForm}
            money={money}
            movementForm={movementForm}
            saving={saving}
            selectedItem={selectedItem}
            selectedWarehouse={selectedWarehouse}
            setItemForm={setItemForm}
            setMovementForm={setMovementForm}
            setSelectedWarehouse={setSelectedWarehouse}
            submitInventoryItem={submitInventoryItem}
            submitInventoryMovement={submitInventoryMovement}
          />
        )}

        {effectiveActiveModule === "rrhh" && canReadModule(data.currentUser, "rrhh") && (
          <HumanResourcesModule
            canAdmin={hasPermission(data.currentUser, "rrhh", "administrador")}
            canEdit={canEditModule(data.currentUser, "rrhh")}
            employees={data.hrEmployees}
            money={money}
          />
        )}

        {effectiveActiveModule === "cierres" &&
          canReadModule(data.currentUser, "cierres") && (
            <MonthlyClosingModule
              canAdmin={hasPermission(
                data.currentUser,
                "cierres",
                "administrador",
              )}
              canEdit={canEditModule(data.currentUser, "cierres")}
              cashboxes={data.cashboxes}
              financeMovements={data.financeMovements}
              hrEmployees={data.hrEmployees}
              inventoryItems={data.inventoryItems}
              money={money}
            />
          )}

        {effectiveActiveModule === "ganadero" &&
          canReadModule(data.currentUser, "ganadero") && (
            <BaseOperationalModule
              description="Base para controlar rodeo, lotes, pesajes, sanidad y movimientos ganaderos."
              kpis={[
                { label: "Rodeo registrado", value: "0" },
                { label: "Lotes activos", value: "0" },
                { label: "Alertas sanitarias", tone: "warning", value: "0" },
                { label: "Estado modulo", tone: "blue", value: "Base" },
              ]}
              roadmap={["Rodeo", "Lotes", "Pesajes", "Sanidad", "Reproduccion", "Ventas"]}
              sampleRows={[
                ["Rodeo", "Registro por categoria y establecimiento"],
                ["Pesaje", "Control de kilos y ganancia diaria"],
                ["Sanidad", "Vacunas, tratamientos y alertas"],
              ]}
              title="Modulo Ganadero"
            />
          )}

        {effectiveActiveModule === "agricola" &&
          canReadModule(data.currentUser, "agricola") && (
            <BaseOperationalModule
              description="Base para planificar campanas, parcelas, insumos, labores y cosechas."
              kpis={[
                { label: "Campanas", value: "0" },
                { label: "Parcelas", value: "0" },
                { label: "Insumos planificados", tone: "warning", value: "0" },
                { label: "Estado modulo", tone: "blue", value: "Base" },
              ]}
              roadmap={["Campanas", "Parcelas", "Siembra", "Insumos", "Labores", "Cosecha"]}
              sampleRows={[
                ["Campanas", "Plan agricola por periodo y cultivo"],
                ["Insumos", "Semillas, fertilizantes y agroquimicos"],
                ["Cosecha", "Rendimiento, destino y costos"],
              ]}
              title="Modulo Agricola"
            />
          )}

        {effectiveActiveModule === "maquinarias" &&
          canReadModule(data.currentUser, "maquinarias") && (
            <BaseOperationalModule
              description="Base para controlar equipos, horas de uso, combustible y mantenimientos."
              kpis={[
                { label: "Equipos", value: "0" },
                { label: "Horas registradas", value: "0" },
                { label: "Mantenimientos", tone: "warning", value: "0" },
                { label: "Estado modulo", tone: "blue", value: "Base" },
              ]}
              roadmap={["Equipos", "Operadores", "Horas", "Combustible", "Mantenimiento", "Costos"]}
              sampleRows={[
                ["Equipos", "Ficha tecnica y estado operativo"],
                ["Combustible", "Carga, consumo y responsable"],
                ["Mantenimiento", "Preventivo, correctivo y repuestos"],
              ]}
              title="Modulo Maquinarias"
            />
          )}
      </section>
    </main>
  );
}

function DashboardModule({
  canReadAgricola,
  canReadCierres,
  canReadDeposito,
  canReadFinance,
  canReadGanadero,
  canReadMaquinarias,
  canReadRrhh,
  data,
  financeReport,
  inventoryReport,
  latestActivities,
  money,
  setActiveModule,
}: {
  canReadAgricola: boolean;
  canReadCierres: boolean;
  canReadDeposito: boolean;
  canReadFinance: boolean;
  canReadGanadero: boolean;
  canReadMaquinarias: boolean;
  canReadRrhh: boolean;
  data: AppData;
  financeReport: {
    balance: number;
    expense: number;
    filtered: FinanceMovement[];
    income: number;
    transfer: number;
    workflow: FinanceMovement[];
  };
  inventoryReport: {
    byWarehouse: Array<{
      items: InventoryItem[];
      lowStock: number;
      stockValue: number;
      warehouse: string;
    }>;
    filteredItems: InventoryItem[];
    lowStock: InventoryItem[];
    value: number;
  };
  latestActivities: DashboardActivity[];
  money: (value: number) => string;
  setActiveModule: (module: ModuleId) => void;
}) {
  const activeEmployees = data.hrEmployees.filter((employee) => employee.status === "activo");
  const payroll = activeEmployees.reduce(
    (sum, employee) =>
      sum + (employee.salaryType === "mensual" ? employee.monthlySalary : 0),
    0,
  );
  const negativeCashboxes = data.cashboxes.filter((cashbox) => {
    const balance = data.financeMovements
      .filter((movement) => movement.cashboxName === cashbox)
      .reduce(
        (sum, movement) =>
          sum + (movement.movementType === "egreso" ? -movement.amount : movement.amount),
        0,
      );
    return balance < 0;
  });

  return (
    <>
      <section className="dashboard-grid" aria-label="Resumen de modulos">
        <button
          className="module-summary-card"
          disabled={!canReadGanadero}
          onClick={() => setActiveModule("ganadero")}
          type="button"
        >
          <span>Ganadero</span>
          <strong>{canReadGanadero ? "Base" : "Sin acceso"}</strong>
          <small>Rodeo, lotes, pesajes y sanidad</small>
        </button>

        <button
          className="module-summary-card"
          disabled={!canReadAgricola}
          onClick={() => setActiveModule("agricola")}
          type="button"
        >
          <span>Agricola</span>
          <strong>{canReadAgricola ? "Base" : "Sin acceso"}</strong>
          <small>Campanas, parcelas, labores y cosecha</small>
        </button>

        <button
          className="module-summary-card"
          disabled={!canReadMaquinarias}
          onClick={() => setActiveModule("maquinarias")}
          type="button"
        >
          <span>Maquinarias</span>
          <strong>{canReadMaquinarias ? "Base" : "Sin acceso"}</strong>
          <small>Equipos, horas, combustible y mantenimiento</small>
        </button>

        <button
          className="module-summary-card"
          disabled={!canReadFinance}
          onClick={() => setActiveModule("financiero")}
          type="button"
        >
          <span>Financiero</span>
          <strong>{canReadFinance ? money(financeReport.balance) : "Sin acceso"}</strong>
          <small>
            {financeReport.filtered.length} movimientos | ingresos {money(financeReport.income)}
          </small>
        </button>

        <button
          className="module-summary-card"
          disabled={!canReadDeposito}
          onClick={() => setActiveModule("deposito")}
          type="button"
        >
          <span>Deposito</span>
          <strong>{canReadDeposito ? money(inventoryReport.value) : "Sin acceso"}</strong>
          <small>
            {inventoryReport.filteredItems.length} articulos | {inventoryReport.lowStock.length} alertas
          </small>
        </button>

        <button
          className="module-summary-card"
          disabled={!canReadRrhh}
          onClick={() => setActiveModule("rrhh")}
          type="button"
        >
          <span>Recursos Humanos</span>
          <strong>{canReadRrhh ? String(activeEmployees.length) : "Sin acceso"}</strong>
          <small>Nomina activa {money(payroll)}</small>
        </button>

        <button
          className="module-summary-card"
          disabled={!canReadCierres}
          onClick={() => setActiveModule("cierres")}
          type="button"
        >
          <span>Cierres</span>
          <strong>{canReadCierres ? "Mensual" : "Sin acceso"}</strong>
          <small>Control, validacion y aprobacion del periodo</small>
        </button>
      </section>

      <div className="dashboard-layout">
        <section className="panel">
          <PanelHeading eyebrow="Actividad" title="Ultimos movimientos" />
          <div className="activity-list">
            {latestActivities.length > 0 ? (
              latestActivities.map((activity) => (
                <article className="activity-row" key={activity.id}>
                  <div>
                    <span>{activity.module}</span>
                    <strong>{activity.title}</strong>
                    <small>{activity.detail}</small>
                  </div>
                  <div className="activity-meta">
                    <time>{formatDate(activity.date)}</time>
                    {activity.amount !== undefined && (
                      <em className={activity.tone ?? ""}>{money(activity.amount)}</em>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="muted-text">Todavia no hay actividades para los modulos asignados.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <PanelHeading eyebrow="Control" title="Alertas generales" />
          <div className="alert-stack">
            <article>
              <span>Stock bajo</span>
              <strong>{inventoryReport.lowStock.length}</strong>
              <small>articulos por debajo del minimo</small>
            </article>
            <article>
              <span>Cajas negativas</span>
              <strong>{negativeCashboxes.length}</strong>
              <small>{negativeCashboxes[0] ?? "Sin saldos negativos"}</small>
            </article>
          </div>
        </section>
      </div>
    </>
  );
}

function BaseOperationalModule({
  description,
  kpis,
  roadmap,
  sampleRows,
  title,
}: {
  description: string;
  kpis: Array<{ label: string; tone?: "blue" | "warning"; value: string }>;
  roadmap: string[];
  sampleRows: Array<[string, string]>;
  title: string;
}) {
  return (
    <>
      <section className="kpi-grid" aria-label={`Indicadores de ${title}`}>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} tone={kpi.tone} value={kpi.value} />
        ))}
      </section>

      <div className="content-grid">
        <section className="panel wide">
          <PanelHeading eyebrow="Estructura inicial" title={title} />
          <p className="muted-text module-description">{description}</p>
          <div className="roadmap-grid">
            {roadmap.map((item) => (
              <article className="roadmap-card" key={item}>
                <span>{item}</span>
                <strong>Preparado</strong>
              </article>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Funcion preparada</th>
                </tr>
              </thead>
              <tbody>
                {sampleRows.map(([area, detail]) => (
                  <tr key={area}>
                    <td>{area}</td>
                    <td>{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function FinanceModule({
  canApprove,
  canEdit,
  cashboxSummaries,
  costCenters,
  exportFinanceCsv,
  financeAccounts,
  financeForm,
  financeMovements,
  financeReport,
  money,
  onMovementsDeleted,
  onMovementUpdated,
  refreshFinanceMovements,
  saving,
  selectedCashbox,
  selectedCostCenter,
  selectedFinanceAccount,
  selectedFinanceModule,
  selectedFinanceStatus,
  selectedMonth,
  setFinanceForm,
  setSelectedCashbox,
  setSelectedCostCenter,
  setSelectedFinanceAccount,
  setSelectedFinanceModule,
  setSelectedFinanceStatus,
  setSelectedMonth,
  submitFinanceMovement,
  updateFinanceMovementStatus,
  updatingMovementId,
}: {
  canApprove: boolean;
  canEdit: boolean;
  cashboxSummaries: Array<{
    balance: number;
    cashbox: string;
    expense: number;
    income: number;
    transfer: number;
  }>;
  costCenters: string[];
  exportFinanceCsv: () => void;
  financeAccounts: string[];
  financeForm: FinanceForm;
  financeMovements: FinanceMovement[];
  financeReport: {
    activeCount: number;
    balance: number;
    expense: number;
    filtered: FinanceMovement[];
    income: number;
    transfer: number;
    workflow: FinanceMovement[];
  };
  money: (value: number) => string;
  onMovementsDeleted: (movementIds: string[]) => void;
  onMovementUpdated: (movement: FinanceMovement) => void;
  refreshFinanceMovements: () => Promise<void>;
  saving: SavingTarget;
  selectedCashbox: string;
  selectedCostCenter: string;
  selectedFinanceAccount: string;
  selectedFinanceModule: string;
  selectedFinanceStatus: string;
  selectedMonth: string;
  setFinanceForm: (form: FinanceForm) => void;
  setSelectedCashbox: (cashbox: string) => void;
  setSelectedCostCenter: (costCenter: string) => void;
  setSelectedFinanceAccount: (account: string) => void;
  setSelectedFinanceModule: (module: string) => void;
  setSelectedFinanceStatus: (status: string) => void;
  setSelectedMonth: (month: string) => void;
  submitFinanceMovement: (event: FormEvent<HTMLFormElement>) => void;
  updateFinanceMovementStatus: (
    movementId: string,
    status: FinanceMovementStatus,
  ) => void;
  updatingMovementId: string | null;
}) {
  const [activeFinanceBlock, setActiveFinanceBlock] = useState<FinanceBlockId>("movimientos");
  const [movementSearch, setMovementSearch] = useState("");
  const activeFinanceBlockLabel =
    financeBlockDefinitions.find((block) => block.id === activeFinanceBlock)?.label ??
    "Movimientos";
  const summaryMonth = selectedMonth || today.slice(0, 7);
  const confirmedMovements = financeReport.filtered.filter(
    (movement) => movement.status === "confirmado",
  );
  const workflowCounts = {
    anulado: financeReport.workflow.filter((movement) => movement.status === "anulado").length,
    borrador: financeReport.workflow.filter((movement) => movement.status === "borrador").length,
    confirmado: financeReport.workflow.filter((movement) => movement.status === "confirmado")
      .length,
    pendiente: financeReport.workflow.filter((movement) => movement.status === "pendiente")
      .length,
  };
  const normalizedSearch = movementSearch.trim().toLocaleLowerCase("es");
  const visibleMovements = financeReport.filtered.filter((movement) => {
    if (!normalizedSearch) return true;
    return [
      movement.concept,
      movement.documentNumber,
      movement.relatedParty,
      movement.responsible,
      movement.cashboxName,
      movement.linkedModule,
      movement.accountName,
      movement.costCenterName,
    ].some((value) => value.toLocaleLowerCase("es").includes(normalizedSearch));
  });
  const latestMovements = financeReport.filtered.slice(0, 6);

  function summarizeMovements(movements: FinanceMovement[]) {
    const income = movements
      .filter((movement) => movement.movementType === "ingreso")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const expense = movements
      .filter((movement) => movement.movementType === "egreso")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const transfer = movements
      .filter((movement) => movement.movementType === "transferencia")
      .reduce((sum, movement) => sum + movement.amount, 0);

    return {
      balance: income - expense,
      count: movements.length,
      expense,
      income,
      transfer,
    };
  }

  const monthlySummary = summarizeMovements(
    financeMovements.filter(
      (movement) =>
        movement.status === "confirmado" &&
        movement.movementDate.startsWith(summaryMonth),
    ),
  );

  const moduleSummaries = linkedModules.map((module) => ({
    label: module,
    ...summarizeMovements(
      confirmedMovements.filter((movement) => movement.linkedModule === module),
    ),
  }));
  const accountSummaries = financeAccounts.map((account) => ({
    label: account,
    ...summarizeMovements(
      confirmedMovements.filter((movement) => movement.accountName === account),
    ),
  }));
  const costCenterSummaries = costCenters.map((costCenter) => ({
    label: costCenter,
    ...summarizeMovements(
      confirmedMovements.filter((movement) => movement.costCenterName === costCenter),
    ),
  }));

  const movementFormPanel = (
    <section className="panel movement-entry-panel">
      <PanelHeading eyebrow="Nuevo registro" title="Cargar movimiento" />
      {!canEdit && (
        <div className="status-banner locked">
          Permiso lector: puede consultar reportes, pero no cargar movimientos.
        </div>
      )}
      <form className="movement-form" onSubmit={submitFinanceMovement}>
        <fieldset className="form-fieldset" disabled={!canEdit || saving === "finance"}>
          <section className="form-section">
            <div className="form-section-heading">
              <span>01</span>
              <div>
                <strong>Datos principales</strong>
                <small>Operacion, caja, fecha y monto</small>
              </div>
            </div>

            <div className="segmented" role="group" aria-label="Tipo de movimiento">
              {(["ingreso", "egreso", "transferencia"] as FinanceMovementType[]).map(
                (type) => (
                  <button
                    className={financeForm.movementType === type ? "selected" : ""}
                    key={type}
                    onClick={() => setFinanceForm({ ...financeForm, movementType: type })}
                    type="button"
                  >
                    {type}
                  </button>
                ),
              )}
            </div>

            <div className="field-row">
              <label>
                Caja
                <select
                  onChange={(event) =>
                    setFinanceForm({ ...financeForm, cashboxName: event.target.value })
                  }
                  value={financeForm.cashboxName}
                >
                  {cashboxes.map((cashbox) => (
                    <option key={cashbox}>{cashbox}</option>
                  ))}
                </select>
              </label>
              <label>
                Fecha
                <input
                  onChange={(event) =>
                    setFinanceForm({ ...financeForm, movementDate: event.target.value })
                  }
                  type="date"
                  value={financeForm.movementDate}
                />
              </label>
            </div>

            <label>
              Concepto
              <input
                onChange={(event) =>
                  setFinanceForm({ ...financeForm, concept: event.target.value })
                }
                placeholder="Ej. compra de balanceado"
                value={financeForm.concept}
              />
            </label>

            <label>
              Monto
              <div className="amount-input">
                <span>Gs.</span>
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    setFinanceForm({ ...financeForm, amount: event.target.value })
                  }
                  placeholder="0"
                  value={financeForm.amount}
                />
              </div>
            </label>
          </section>

          <section className="form-section">
            <div className="form-section-heading">
              <span>02</span>
              <div>
                <strong>Clasificacion</strong>
                <small>Destino contable y operativo</small>
              </div>
            </div>

            <div className="field-row">
              <label>
                Modulo vinculado
                <select
                onChange={(event) =>
                  setFinanceForm({
                    ...financeForm,
                    linkedModule: event.target.value as LinkedModule,
                  })
                }
                value={financeForm.linkedModule}
              >
                {linkedModules.map((module) => (
                  <option key={module}>{module}</option>
                ))}
              </select>
            </label>
            <label>
              Cuenta contable
              <select
                onChange={(event) =>
                  setFinanceForm({ ...financeForm, accountName: event.target.value })
                }
                value={financeForm.accountName}
              >
                {financeAccounts.map((account) => (
                  <option key={account}>{account}</option>
                ))}
                </select>
              </label>
            </div>

            <label>
              Centro de costo
              <select
                onChange={(event) =>
                  setFinanceForm({ ...financeForm, costCenterName: event.target.value })
                }
                value={financeForm.costCenterName}
              >
                {costCenters.map((costCenter) => (
                  <option key={costCenter}>{costCenter}</option>
                ))}
              </select>
            </label>

            <div className="field-row">
              <label>
                Categoria
                <select
                  onChange={(event) =>
                    setFinanceForm({ ...financeForm, category: event.target.value })
                  }
                  value={financeForm.category}
                >
                  {financeCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Medio de pago
                <select
                  onChange={(event) =>
                    setFinanceForm({ ...financeForm, paymentMethod: event.target.value })
                  }
                  value={financeForm.paymentMethod}
                >
                  {paymentMethods.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-heading">
              <span>03</span>
              <div>
                <strong>Respaldo y control</strong>
                <small>Comprobante, responsable y revision</small>
              </div>
            </div>

            <div className="field-row">
              <label>
                Comprobante
                <input
                  onChange={(event) =>
                    setFinanceForm({ ...financeForm, documentNumber: event.target.value })
                  }
                  placeholder="Factura o recibo"
                  value={financeForm.documentNumber}
                />
              </label>
              <label>
                Responsable
                <input
                  onChange={(event) =>
                    setFinanceForm({ ...financeForm, responsible: event.target.value })
                  }
                  placeholder="Persona o sector"
                  value={financeForm.responsible}
                />
              </label>
            </div>

            <label>
              Contraparte
              <input
                onChange={(event) =>
                  setFinanceForm({ ...financeForm, relatedParty: event.target.value })
                }
                placeholder="Cliente, proveedor o caja destino"
                value={financeForm.relatedParty}
              />
            </label>

            <label>
              Guardar como
              <select
                onChange={(event) =>
                  setFinanceForm({
                    ...financeForm,
                    status: event.target.value as FinanceMovementStatus,
                  })
                }
                value={financeForm.status}
              >
                <option value="borrador">Borrador</option>
                <option value="pendiente">Pendiente de revision</option>
                {canApprove && <option value="confirmado">Confirmado</option>}
              </select>
            </label>

            <label>
              Notas
              <input
                onChange={(event) =>
                  setFinanceForm({ ...financeForm, notes: event.target.value })
                }
                placeholder="Detalle interno"
                value={financeForm.notes}
              />
            </label>
          </section>

          <div className="form-actions">
            <span>Origen: {financeForm.sourceModule}</span>
            <button
              className="submit-button"
              disabled={!canEdit || saving === "finance"}
              type="submit"
            >
              {saving === "finance" ? "Guardando..." : "Guardar movimiento"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );

  const reportPanel = (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Reportes</p>
          <h3>Movimientos financieros</h3>
        </div>
        <button type="button" onClick={exportFinanceCsv}>
          Exportar CSV
        </button>
      </div>

      <div className="report-controls">
        <label>
          Caja
          <select
            onChange={(event) => setSelectedCashbox(event.target.value)}
            value={selectedCashbox}
          >
            <option>Todas</option>
            {cashboxes.map((cashbox) => (
              <option key={cashbox}>{cashbox}</option>
            ))}
          </select>
        </label>
        <label>
          Modulo
          <select
            onChange={(event) => setSelectedFinanceModule(event.target.value)}
            value={selectedFinanceModule}
          >
            <option>Todos</option>
            {linkedModules.map((module) => (
              <option key={module}>{module}</option>
            ))}
          </select>
        </label>
        <label>
          Cuenta
          <select
            onChange={(event) => setSelectedFinanceAccount(event.target.value)}
            value={selectedFinanceAccount}
          >
            <option>Todas</option>
            {financeAccounts.map((account) => (
              <option key={account}>{account}</option>
            ))}
          </select>
        </label>
        <label>
          Centro de costo
          <select
            onChange={(event) => setSelectedCostCenter(event.target.value)}
            value={selectedCostCenter}
          >
            <option>Todos</option>
            {costCenters.map((costCenter) => (
              <option key={costCenter}>{costCenter}</option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select
            onChange={(event) => setSelectedFinanceStatus(event.target.value)}
            value={selectedFinanceStatus}
          >
            <option>Todos</option>
            <option value="borrador">Borrador</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmado">Confirmado</option>
            <option value="anulado">Anulado</option>
          </select>
        </label>
        <label>
          Mes
          <input
            onChange={(event) => setSelectedMonth(event.target.value)}
            type="month"
            value={selectedMonth}
          />
        </label>
      </div>

      <p className="muted-text">
        {financeReport.activeCount} movimientos confirmados en el filtro actual.
      </p>

      <MovementTable movements={financeReport.filtered} money={money} />
    </section>
  );

  const cashboxesPanel = (
    <section className="panel wide">
      <PanelHeading eyebrow="Cajas" title="Resumen de las 6 cajas" />
      <div className="cashbox-grid">
        {cashboxSummaries.map((summary) => (
          <article className="cashbox-card" key={summary.cashbox}>
            <span>{summary.cashbox}</span>
            <strong className={summary.balance < 0 ? "negative" : "positive"}>
              {money(summary.balance)}
            </strong>
            <dl>
              <div>
                <dt>Ingresos</dt>
                <dd>{money(summary.income)}</dd>
              </div>
              <div>
                <dt>Egresos</dt>
                <dd>{money(summary.expense)}</dd>
              </div>
              <div>
                <dt>Transferencias</dt>
                <dd>{money(summary.transfer)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );

  return (
    <>
      <section className="finance-block-navigation">
        <div className="finance-block-status">
          <span>Bloque activo</span>
          <strong>{activeFinanceBlockLabel}</strong>
        </div>
        <div
          className="finance-block-tabs finance-block-tabs-main"
          role="tablist"
          aria-label="Bloques financieros"
        >
          {financeBlockDefinitions.map((block) => (
            <button
              aria-selected={activeFinanceBlock === block.id}
              className={activeFinanceBlock === block.id ? "active" : ""}
              key={block.id}
              onClick={() => setActiveFinanceBlock(block.id)}
              role="tab"
              type="button"
            >
              {block.label}
            </button>
          ))}
        </div>
      </section>

      {activeFinanceBlock === "resumen" && (
        <div className="finance-summary">
          <div className="finance-summary-heading">
            <div>
              <p className="eyebrow">Resumen mensual</p>
              <h3>Indicadores financieros</h3>
            </div>
            <label>
              Mes
              <input
                onChange={(event) => setSelectedMonth(event.target.value)}
                type="month"
                value={summaryMonth}
              />
            </label>
          </div>

          <section className="kpi-grid finance-summary-kpis" aria-label="Indicadores mensuales">
            <KpiCard label="Saldo del mes" value={money(monthlySummary.balance)} />
            <KpiCard label="Ingresos del mes" value={money(monthlySummary.income)} />
            <KpiCard label="Egresos del mes" tone="warning" value={money(monthlySummary.expense)} />
            <KpiCard
              label="Transferencias del mes"
              tone="blue"
              value={money(monthlySummary.transfer)}
            />
          </section>

          <div className="finance-block-grid">
            <section className="panel">
              <PanelHeading eyebrow="Resumen" title="Flujo por modulo" />
              <div className="report-stack">
                {moduleSummaries.map((summary) => (
                  <article className="report-card" key={summary.label}>
                    <div>
                      <strong>{summary.label}</strong>
                      <span>{summary.count} movimientos</span>
                    </div>
                    <strong className={summary.balance < 0 ? "negative" : "positive"}>
                      {money(summary.balance)}
                    </strong>
                  </article>
                ))}
              </div>
            </section>
            <section className="panel">
              <PanelHeading eyebrow="Actividad" title="Ultimos movimientos" />
              <div className="activity-list">
                {latestMovements.map((movement) => (
                  <article className="activity-row" key={movement.id}>
                    <div>
                      <span>{movement.linkedModule}</span>
                      <strong>{movement.concept}</strong>
                      <small>
                        {movement.cashboxName} | {movement.accountName}
                      </small>
                    </div>
                    <div className="activity-meta">
                      <time>{formatDate(movement.movementDate)}</time>
                      <em className={movement.movementType === "egreso" ? "negative" : ""}>
                        {movement.movementType === "egreso" ? "-" : "+"}
                        {money(movement.amount)}
                      </em>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            {cashboxesPanel}
          </div>
        </div>
      )}

      {activeFinanceBlock === "cajas" && cashboxesPanel}

      {activeFinanceBlock === "movimientos" && (
        <div className="finance-movements-layout">
          <section className="panel movement-ledger-panel">
            <div className="panel-heading movement-ledger-heading">
              <div>
                <p className="eyebrow">Registro central</p>
                <h3>Movimientos financieros</h3>
              </div>
              <span>{visibleMovements.length} registros</span>
            </div>

            <div className="movement-toolbar">
              <label className="movement-search">
                Buscar
                <input
                  onChange={(event) => setMovementSearch(event.target.value)}
                  placeholder="Concepto, comprobante, responsable..."
                  type="search"
                  value={movementSearch}
                />
              </label>
              <label>
                Caja
                <select
                  onChange={(event) => setSelectedCashbox(event.target.value)}
                  value={selectedCashbox}
                >
                  <option>Todas</option>
                  {cashboxes.map((cashbox) => (
                    <option key={cashbox}>{cashbox}</option>
                  ))}
                </select>
              </label>
              <label>
                Modulo
                <select
                  onChange={(event) => setSelectedFinanceModule(event.target.value)}
                  value={selectedFinanceModule}
                >
                  <option>Todos</option>
                  {linkedModules.map((module) => (
                    <option key={module}>{module}</option>
                  ))}
                </select>
              </label>
              <label>
                Estado
                <select
                  onChange={(event) => setSelectedFinanceStatus(event.target.value)}
                  value={selectedFinanceStatus}
                >
                  <option>Todos</option>
                  <option value="borrador">Borrador</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="anulado">Anulado</option>
                </select>
              </label>
              <label>
                Mes
                <input
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  type="month"
                  value={selectedMonth}
                />
              </label>
              <button
                className="secondary-button clear-filters"
                onClick={() => {
                  setMovementSearch("");
                  setSelectedCashbox("Todas");
                  setSelectedFinanceModule("Todos");
                  setSelectedFinanceStatus("Todos");
                  setSelectedMonth("");
                }}
                type="button"
              >
                Limpiar filtros
              </button>
            </div>

            <MovementTable
              canApprove={canApprove}
              canEdit={canEdit}
              money={money}
              movements={visibleMovements}
              onStatusChange={updateFinanceMovementStatus}
              updatingMovementId={updatingMovementId}
            />
          </section>

          <div className="content-grid finance-entry-layout">
            {movementFormPanel}
            <section className="panel workflow-panel">
              <PanelHeading eyebrow="Control" title="Estado del registro" />
              <div className="workflow-summary">
                <button
                  className={selectedFinanceStatus === "borrador" ? "active" : ""}
                  onClick={() => setSelectedFinanceStatus("borrador")}
                  type="button"
                >
                  <span className="status-dot draft" />
                  <span>Borradores</span>
                  <strong>{workflowCounts.borrador}</strong>
                </button>
                <button
                  className={selectedFinanceStatus === "pendiente" ? "active" : ""}
                  onClick={() => setSelectedFinanceStatus("pendiente")}
                  type="button"
                >
                  <span className="status-dot pending" />
                  <span>Pendientes</span>
                  <strong>{workflowCounts.pendiente}</strong>
                </button>
                <button
                  className={selectedFinanceStatus === "confirmado" ? "active" : ""}
                  onClick={() => setSelectedFinanceStatus("confirmado")}
                  type="button"
                >
                  <span className="status-dot confirmed" />
                  <span>Confirmados</span>
                  <strong>{workflowCounts.confirmado}</strong>
                </button>
                <button
                  className={selectedFinanceStatus === "anulado" ? "active" : ""}
                  onClick={() => setSelectedFinanceStatus("anulado")}
                  type="button"
                >
                  <span className="status-dot cancelled" />
                  <span>Anulados</span>
                  <strong>{workflowCounts.anulado}</strong>
                </button>
              </div>
              <div className="workflow-totals">
                <div>
                  <span>Ingresos confirmados</span>
                  <strong>{money(financeReport.income)}</strong>
                </div>
                <div>
                  <span>Egresos confirmados</span>
                  <strong>{money(financeReport.expense)}</strong>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeFinanceBlock === "gastos-caja" && (
        <CashExpensesPanel
          canAdmin={canApprove}
          canEdit={canEdit}
          fallbackAccounts={financeAccounts}
          fallbackCashboxes={cashboxes}
          fallbackCostCenters={costCenters}
          money={money}
          onFinanceChanged={refreshFinanceMovements}
          period={selectedMonth || summaryMonth}
          setPeriod={setSelectedMonth}
        />
      )}

      {activeFinanceBlock === "plan-cuentas" && (
        <section className="panel">
          <PanelHeading eyebrow="Plan de cuentas" title="Cuentas contables" />
          <div className="finance-list-grid">
            {accountSummaries.map((summary) => (
              <article className="finance-list-card" key={summary.label}>
                <div>
                  <span>Cuenta</span>
                  <strong>{summary.label}</strong>
                  <small>{summary.count} movimientos activos</small>
                </div>
                <dl>
                  <div>
                    <dt>Ingresos</dt>
                    <dd>{money(summary.income)}</dd>
                  </div>
                  <div>
                    <dt>Egresos</dt>
                    <dd>{money(summary.expense)}</dd>
                  </div>
                  <div>
                    <dt>Saldo</dt>
                    <dd className={summary.balance < 0 ? "negative" : "positive"}>
                      {money(summary.balance)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeFinanceBlock === "centros-costo" && (
        <section className="panel">
          <PanelHeading eyebrow="Centros de costo" title="Costo por sector" />
          <div className="finance-list-grid">
            {costCenterSummaries.map((summary) => (
              <article className="finance-list-card" key={summary.label}>
                <div>
                  <span>Centro</span>
                  <strong>{summary.label}</strong>
                  <small>{summary.count} movimientos activos</small>
                </div>
                <dl>
                  <div>
                    <dt>Ingresos</dt>
                    <dd>{money(summary.income)}</dd>
                  </div>
                  <div>
                    <dt>Egresos</dt>
                    <dd>{money(summary.expense)}</dd>
                  </div>
                  <div>
                    <dt>Saldo</dt>
                    <dd className={summary.balance < 0 ? "negative" : "positive"}>
                      {money(summary.balance)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeFinanceBlock === "pagar" && (
        <FinanceObligationsPanel
          canAdmin={canApprove}
          canEdit={canEdit}
          cashboxes={cashboxes}
          costCenters={costCenters}
          financeAccounts={financeAccounts}
          money={money}
          onMovementsRefresh={refreshFinanceMovements}
          type="pagar"
        />
      )}

      {activeFinanceBlock === "cobrar" && (
        <FinanceObligationsPanel
          canAdmin={canApprove}
          canEdit={canEdit}
          cashboxes={cashboxes}
          costCenters={costCenters}
          financeAccounts={financeAccounts}
          money={money}
          onMovementsRefresh={refreshFinanceMovements}
          type="cobrar"
        />
      )}

      {activeFinanceBlock === "reportes" && reportPanel}

      {activeFinanceBlock === "configuracion" && (
        <div className="finance-block-grid">
          <section className="panel">
            <PanelHeading eyebrow="Configuracion" title="Catalogos financieros" />
            <div className="summary-grid">
              <div>
                <span>Cajas</span>
                <strong>{String(cashboxes.length)}</strong>
              </div>
              <div>
                <span>Cuentas</span>
                <strong>{String(financeAccounts.length)}</strong>
              </div>
              <div>
                <span>Centros</span>
                <strong>{String(costCenters.length)}</strong>
              </div>
            </div>
          </section>
          <section className="panel">
            <PanelHeading eyebrow="Metodos" title="Medios de pago" />
            <div className="finance-chip-list">
              {paymentMethods.map((method) => (
                <span key={method}>{method}</span>
              ))}
            </div>
          </section>
          <FinanceRecordMaintenance
            canAdmin={canApprove}
            cashboxes={cashboxes}
            costCenters={costCenters}
            financeAccounts={financeAccounts}
            money={money}
            movements={financeMovements}
            onDeleted={onMovementsDeleted}
            onOpenSource={(source) =>
              setActiveFinanceBlock(
                source === "gastos_caja"
                  ? "gastos-caja"
                  : source === "cuentas_por_pagar"
                    ? "pagar"
                    : "cobrar",
              )
            }
            onUpdated={onMovementUpdated}
          />
          {cashboxesPanel}
        </div>
      )}
    </>
  );
}

function InventoryModule({
  canEdit,
  inventoryReport,
  itemForm,
  money,
  movementForm,
  saving,
  selectedItem,
  selectedWarehouse,
  setItemForm,
  setMovementForm,
  setSelectedWarehouse,
  submitInventoryItem,
  submitInventoryMovement,
}: {
  canEdit: boolean;
  inventoryReport: {
    byWarehouse: Array<{
      items: InventoryItem[];
      lowStock: number;
      stockValue: number;
      warehouse: string;
    }>;
    filteredItems: InventoryItem[];
    lowStock: InventoryItem[];
    value: number;
  };
  itemForm: ItemForm;
  money: (value: number) => string;
  movementForm: InventoryMovementForm;
  saving: SavingTarget;
  selectedItem?: InventoryItem;
  selectedWarehouse: string;
  setItemForm: (form: ItemForm) => void;
  setMovementForm: (form: InventoryMovementForm) => void;
  setSelectedWarehouse: (warehouse: string) => void;
  submitInventoryItem: (event: FormEvent<HTMLFormElement>) => void;
  submitInventoryMovement: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <section className="kpi-grid" aria-label="Indicadores de deposito">
        <KpiCard label="Valor de stock filtrado" value={money(inventoryReport.value)} />
        <KpiCard label="Articulos" value={String(inventoryReport.filteredItems.length)} />
        <KpiCard
          label="Alertas minimo"
          tone="warning"
          value={String(inventoryReport.lowStock.length)}
        />
        <KpiCard label="Depositos" tone="blue" value={String(warehouses.length)} />
      </section>

      <div className="content-grid inventory-layout">
        <section className="panel">
          <PanelHeading eyebrow="Deposito" title="Nuevo articulo" />
          {!canEdit && (
            <div className="status-banner locked">
              Permiso lector: puede consultar stock, pero no cargar articulos.
            </div>
          )}
          <form className="movement-form" onSubmit={submitInventoryItem}>
            <fieldset className="form-fieldset" disabled={!canEdit || saving === "item"}>
              <label>
                Deposito
                <select
                  onChange={(event) =>
                    setItemForm({ ...itemForm, warehouseName: event.target.value })
                  }
                  value={itemForm.warehouseName}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse}>{warehouse}</option>
                  ))}
                </select>
              </label>
            <div className="field-row">
              <label>
                Codigo
                <input
                  onChange={(event) => setItemForm({ ...itemForm, sku: event.target.value })}
                  placeholder="SKU interno"
                  value={itemForm.sku}
                />
              </label>
              <label>
                Categoria
                <select
                  onChange={(event) =>
                    setItemForm({ ...itemForm, category: event.target.value })
                  }
                  value={itemForm.category}
                >
                  {inventoryCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Articulo
              <input
                onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })}
                placeholder="Nombre del insumo"
                value={itemForm.name}
              />
            </label>
            <div className="field-row">
              <label>
                Stock actual
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    setItemForm({ ...itemForm, currentStock: event.target.value })
                  }
                  placeholder="0"
                  value={itemForm.currentStock}
                />
              </label>
              <label>
                Stock minimo
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    setItemForm({ ...itemForm, minStock: event.target.value })
                  }
                  placeholder="0"
                  value={itemForm.minStock}
                />
              </label>
            </div>
            <div className="field-row">
              <label>
                Unidad
                <select
                  onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })}
                  value={itemForm.unit}
                >
                  {inventoryUnits.map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </label>
              <label>
                Costo unitario
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    setItemForm({ ...itemForm, unitCost: event.target.value })
                  }
                  placeholder="0"
                  value={itemForm.unitCost}
                />
              </label>
            </div>
            <label>
              Proveedor
              <input
                onChange={(event) => setItemForm({ ...itemForm, supplier: event.target.value })}
                placeholder="Proveedor principal"
                value={itemForm.supplier}
              />
            </label>
              <button className="submit-button" disabled={!canEdit || saving === "item"} type="submit">
                {saving === "item" ? "Guardando..." : "Guardar articulo"}
              </button>
            </fieldset>
          </form>
        </section>

        <section className="panel">
          <PanelHeading eyebrow="Stock" title="Movimiento de deposito" />
          {!canEdit && (
            <div className="status-banner locked">
              Permiso lector: puede consultar movimientos, pero no cargar cambios de stock.
            </div>
          )}
          <form className="movement-form" onSubmit={submitInventoryMovement}>
            <fieldset
              className="form-fieldset"
              disabled={!canEdit || saving === "inventory-movement"}
            >
              <label>
                Articulo
                <select
                  onChange={(event) =>
                    setMovementForm({ ...movementForm, itemId: event.target.value })
                  }
                  value={selectedItem?.id ?? ""}
                >
                  {inventoryReport.filteredItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - {item.warehouseName}
                    </option>
                  ))}
                </select>
              </label>
            <div className="field-row">
              <label>
                Tipo
                <select
                  onChange={(event) =>
                    setMovementForm({
                      ...movementForm,
                      movementType: event.target.value as InventoryMovementType,
                    })
                  }
                  value={movementForm.movementType}
                >
                  <option value="entrada">entrada</option>
                  <option value="salida">salida</option>
                  <option value="traslado">traslado</option>
                  <option value="ajuste">ajuste</option>
                </select>
              </label>
              <label>
                Fecha
                <input
                  onChange={(event) =>
                    setMovementForm({ ...movementForm, movementDate: event.target.value })
                  }
                  type="date"
                  value={movementForm.movementDate}
                />
              </label>
            </div>
            {movementForm.movementType === "traslado" && (
              <label>
                Deposito destino
                <select
                  onChange={(event) =>
                    setMovementForm({
                      ...movementForm,
                      targetWarehouseName: event.target.value,
                    })
                  }
                  value={movementForm.targetWarehouseName}
                >
                  {warehouses
                    .filter((warehouse) => warehouse !== selectedItem?.warehouseName)
                    .map((warehouse) => (
                      <option key={warehouse}>{warehouse}</option>
                    ))}
                </select>
              </label>
            )}
            <div className="field-row">
              <label>
                Cantidad
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    setMovementForm({ ...movementForm, quantity: event.target.value })
                  }
                  placeholder="0"
                  value={movementForm.quantity}
                />
              </label>
              <label>
                Costo unitario
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    setMovementForm({ ...movementForm, unitCost: event.target.value })
                  }
                  placeholder={selectedItem ? String(selectedItem.unitCost) : "0"}
                  value={movementForm.unitCost}
                />
              </label>
            </div>
            <div className="field-row">
              <label>
                Comprobante
                <input
                  onChange={(event) =>
                    setMovementForm({ ...movementForm, documentNumber: event.target.value })
                  }
                  placeholder="Remision, factura, vale"
                  value={movementForm.documentNumber}
                />
              </label>
              <label>
                Responsable
                <input
                  onChange={(event) =>
                    setMovementForm({ ...movementForm, responsible: event.target.value })
                  }
                  placeholder="Persona o sector"
                  value={movementForm.responsible}
                />
              </label>
            </div>
            <label>
              Notas
              <input
                onChange={(event) =>
                  setMovementForm({ ...movementForm, notes: event.target.value })
                }
                placeholder="Detalle interno"
                value={movementForm.notes}
              />
            </label>
              <button
                className="submit-button"
                disabled={!canEdit || !selectedItem || saving === "inventory-movement"}
                type="submit"
              >
                {saving === "inventory-movement" ? "Guardando..." : "Guardar movimiento"}
              </button>
            </fieldset>
          </form>
        </section>

        <section className="panel wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Depositos</p>
              <h3>Stock por deposito fisico</h3>
            </div>
            <label className="inline-filter">
              Filtro
              <select
                onChange={(event) => setSelectedWarehouse(event.target.value)}
                value={selectedWarehouse}
              >
                <option>Todos</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse}>{warehouse}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="warehouse-grid">
            {inventoryReport.byWarehouse.map((summary) => (
              <article className="warehouse-card" key={summary.warehouse}>
                <span>{summary.warehouse}</span>
                <strong>{money(summary.stockValue)}</strong>
                <small>
                  {summary.items.length} articulos | {summary.lowStock} alertas
                </small>
              </article>
            ))}
          </div>

          <InventoryTable items={inventoryReport.filteredItems} money={money} />
        </section>
      </div>
    </>
  );
}

function KpiCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "blue" | "warning";
  value: string;
}) {
  return (
    <article className={`kpi-card ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PanelHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
      </div>
    </div>
  );
}

function MovementTable({
  canApprove = false,
  canEdit = false,
  money,
  movements,
  onStatusChange,
  updatingMovementId,
}: {
  canApprove?: boolean;
  canEdit?: boolean;
  money: (value: number) => string;
  movements: FinanceMovement[];
  onStatusChange?: (
    movementId: string,
    status: FinanceMovementStatus,
  ) => void;
  updatingMovementId?: string | null;
}) {
  const statusLabels: Record<FinanceMovementStatus, string> = {
    anulado: "Anulado",
    borrador: "Borrador",
    confirmado: "Confirmado",
    pendiente: "Pendiente",
  };

  return (
    <div className="table-wrap movement-table-wrap">
      <table className="movement-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Movimiento</th>
            <th>Origen</th>
            <th>Clasificacion</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Monto</th>
            {onStatusChange && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {movements.length === 0 && (
            <tr>
              <td className="table-empty" colSpan={onStatusChange ? 8 : 7}>
                No hay movimientos que coincidan con los filtros.
              </td>
            </tr>
          )}
          {movements.map((movement) => (
            <tr key={movement.id}>
              <td>{formatDate(movement.movementDate)}</td>
              <td>
                <div className="table-primary">
                  <strong>{movement.concept}</strong>
                  <span>{movement.documentNumber || "Sin comprobante"}</span>
                </div>
              </td>
              <td>
                <div className="table-primary">
                  <strong>{movement.linkedModule}</strong>
                  <span>{movement.cashboxName}</span>
                </div>
              </td>
              <td>
                <div className="table-primary">
                  <strong>{movement.accountName}</strong>
                  <span>
                    {movement.costCenterName}
                    {movement.costObjectName
                      ? ` | ${movement.costObjectName}`
                      : ""}
                  </span>
                </div>
              </td>
              <td>
                <span className={`movement-type ${movement.movementType}`}>
                  {movement.movementType}
                </span>
              </td>
              <td>
                <span className={`status-badge ${movement.status}`}>
                  {statusLabels[movement.status]}
                </span>
              </td>
              <td
                className={
                  movement.movementType === "egreso"
                    ? "negative amount-cell"
                    : "positive amount-cell"
                }
              >
                {movement.movementType === "egreso" ? "-" : "+"}
                {money(movement.amount)}
              </td>
              {onStatusChange && (
                <td>
                  <div className="table-actions">
                    {movement.status === "borrador" && canEdit && (
                      <button
                        disabled={updatingMovementId === movement.id}
                        onClick={() => onStatusChange(movement.id, "pendiente")}
                        type="button"
                      >
                        Enviar
                      </button>
                    )}
                    {movement.status === "pendiente" && canApprove && (
                      <>
                        <button
                          className="confirm"
                          disabled={updatingMovementId === movement.id}
                          onClick={() => onStatusChange(movement.id, "confirmado")}
                          type="button"
                        >
                          Confirmar
                        </button>
                        <button
                          className="cancel"
                          disabled={updatingMovementId === movement.id}
                          onClick={() => onStatusChange(movement.id, "anulado")}
                          type="button"
                        >
                          Anular
                        </button>
                      </>
                    )}
                    {movement.status === "confirmado" && canApprove && (
                      <button
                        className="cancel"
                        disabled={updatingMovementId === movement.id}
                        onClick={() => onStatusChange(movement.id, "anulado")}
                        type="button"
                      >
                        Anular
                      </button>
                    )}
                    {movement.status === "anulado" && canApprove && (
                      <button
                        className="confirm"
                        disabled={updatingMovementId === movement.id}
                        onClick={() =>
                          onStatusChange(movement.id, "confirmado")
                        }
                        type="button"
                      >
                        Reactivar
                      </button>
                    )}
                    {movement.status === "anulado" && !canApprove && (
                      <span className="closed-label">Cerrado</span>
                    )}
                    {movement.status === "pendiente" && !canApprove && (
                      <span className="closed-label">En revision</span>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InventoryTable({
  items,
  money,
}: {
  items: InventoryItem[];
  money: (value: number) => string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Deposito</th>
            <th>Codigo</th>
            <th>Articulo</th>
            <th>Categoria</th>
            <th>Stock</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.warehouseName}</td>
              <td>{item.sku}</td>
              <td>{item.name}</td>
              <td>{item.category}</td>
              <td className={item.currentStock <= item.minStock ? "negative" : ""}>
                {item.currentStock} {item.unit}
              </td>
              <td>{money(item.currentStock * item.unitCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function calculateLocalStock(
  item: InventoryItem,
  movementType: InventoryMovementType,
  quantity: number,
): InventoryItem {
  const nextStock =
    movementType === "entrada"
      ? item.currentStock + quantity
      : movementType === "ajuste"
        ? quantity
        : item.currentStock - quantity;

  return {
    ...item,
    currentStock: nextStock,
    updatedAt: new Date().toISOString(),
  };
}

function formatDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function getTimeValue(value: string) {
  if (!value) return 0;
  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}
