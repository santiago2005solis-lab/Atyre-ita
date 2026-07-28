import type {
  FinanceMovement,
  InventoryItem,
  InventoryMovement,
} from "./company-data";

type FinanceMovementRow = {
  account_name?: string | null;
  amount: string | number;
  cashbox_name: string;
  category: string;
  concept: string;
  cost_object_name?: string | null;
  cost_center_name?: string | null;
  created_at: string;
  currency: "PYG";
  document_number: string | null;
  id: string;
  linked_module?: FinanceMovement["linkedModule"] | null;
  movement_date: string;
  movement_type: FinanceMovement["movementType"];
  notes: string | null;
  payment_method: string | null;
  related_party: string | null;
  responsible: string | null;
  source_module?: string | null;
  status?: FinanceMovement["status"] | "activo" | null;
};

type InventoryItemRow = {
  category: string;
  current_stock: string | number;
  id: string;
  min_stock: string | number;
  name: string;
  sku: string;
  supplier: string | null;
  unit: string;
  unit_cost: string | number;
  updated_at: string;
  warehouse_name: string;
};

type InventoryMovementRow = {
  created_at: string;
  document_number: string | null;
  id: string;
  item_id: string;
  movement_date: string;
  movement_type: InventoryMovement["movementType"];
  notes: string | null;
  quantity: string | number;
  responsible: string | null;
  target_warehouse_name: string | null;
  unit_cost: string | number;
  warehouse_name: string;
};

export function financeMovementFromRow(row: FinanceMovementRow): FinanceMovement {
  return {
    id: row.id,
    accountName: row.account_name ?? row.category,
    cashboxName: row.cashbox_name,
    costObjectName: row.cost_object_name ?? "",
    costCenterName: row.cost_center_name ?? "General",
    movementType: row.movement_type,
    movementDate: row.movement_date,
    concept: row.concept,
    category: row.category,
    amount: Number(row.amount),
    currency: row.currency,
    linkedModule: row.linked_module ?? "General",
    paymentMethod: row.payment_method ?? "",
    documentNumber: row.document_number ?? "",
    responsible: row.responsible ?? "",
    relatedParty: row.related_party ?? "",
    sourceModule: row.source_module ?? "manual",
    status: row.status === "activo" || !row.status ? "confirmado" : row.status,
    notes: row.notes ?? "",
    createdAt: row.created_at,
  };
}

export function financeMovementToRow(
  movement: Omit<FinanceMovement, "createdAt" | "id">,
) {
  return {
    cashbox_name: movement.cashboxName,
    movement_type: movement.movementType,
    movement_date: movement.movementDate,
    concept: movement.concept,
    category: movement.category,
    account_name: movement.accountName,
    amount: movement.amount,
    cost_object_name: movement.costObjectName ?? null,
    cost_center_name: movement.costCenterName,
    currency: movement.currency,
    linked_module: movement.linkedModule,
    payment_method: movement.paymentMethod,
    document_number: movement.documentNumber,
    responsible: movement.responsible,
    related_party: movement.relatedParty,
    source_module: movement.sourceModule,
    status: movement.status,
    notes: movement.notes,
  };
}

export function inventoryItemFromRow(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    warehouseName: row.warehouse_name,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    currentStock: Number(row.current_stock),
    minStock: Number(row.min_stock),
    unitCost: Number(row.unit_cost),
    supplier: row.supplier ?? "",
    updatedAt: row.updated_at,
  };
}

export function inventoryItemToRow(item: Omit<InventoryItem, "id" | "updatedAt">) {
  return {
    warehouse_name: item.warehouseName,
    sku: item.sku,
    name: item.name,
    category: item.category,
    unit: item.unit,
    current_stock: item.currentStock,
    min_stock: item.minStock,
    unit_cost: item.unitCost,
    supplier: item.supplier,
  };
}

export function inventoryMovementFromRow(row: InventoryMovementRow): InventoryMovement {
  return {
    id: row.id,
    itemId: row.item_id,
    warehouseName: row.warehouse_name,
    targetWarehouseName: row.target_warehouse_name ?? "",
    movementType: row.movement_type,
    movementDate: row.movement_date,
    quantity: Number(row.quantity),
    unitCost: Number(row.unit_cost),
    documentNumber: row.document_number ?? "",
    responsible: row.responsible ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
  };
}

export function inventoryMovementToRow(
  movement: Omit<InventoryMovement, "createdAt" | "id">,
) {
  return {
    item_id: movement.itemId,
    warehouse_name: movement.warehouseName,
    target_warehouse_name: movement.targetWarehouseName || null,
    movement_type: movement.movementType,
    movement_date: movement.movementDate,
    quantity: movement.quantity,
    unit_cost: movement.unitCost,
    document_number: movement.documentNumber,
    responsible: movement.responsible,
    notes: movement.notes,
  };
}
