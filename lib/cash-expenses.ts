import type { LinkedModule } from "./company-data";

export type CashExpenseStatus = "pendiente" | "confirmado" | "anulado";
export type CashExpenseMappingStatus = "automatico" | "revisado";
export type CommerceImportStatus = "pendiente" | "conciliado" | "omitido";

export type CashExpenseAllocation = {
  accountName: string;
  amount: number;
  costCenterName: string;
  detail: string;
  documentId: string;
  id: string;
  linkedModule: LinkedModule;
  mappingStatus: CashExpenseMappingStatus;
  movementId: string;
  sourceCategory: string;
  sourceSubcategory: string;
};

export type CashExpenseDocument = {
  allocations: CashExpenseAllocation[];
  cashboxName: string;
  createdAt: string;
  description: string;
  documentDate: string;
  documentNumber: string;
  id: string;
  importBatchId: string;
  legacyId: string;
  notes: string;
  paymentMethod: string;
  responsible: string;
  source: string;
  status: CashExpenseStatus;
  supplier: string;
  totalAmount: number;
  updatedAt: string;
};

export type CashExpenseImportBatch = {
  allocationCount: number;
  commerceCount: number;
  createdAt: string;
  expenseCount: number;
  fileName: string;
  fingerprint: string;
  id: string;
  importedByName: string;
  totalAmount: number;
};

export type ImportedCommerceRecord = {
  amount: number;
  cashboxName: string;
  clientName: string;
  createdAt: string;
  detail: string;
  documentDate: string;
  documentNumber: string;
  dueDate: string;
  id: string;
  importBatchId: string;
  legacyId: string;
  notes: string;
  paidAmount: number;
  paymentMethod: string;
  sourceCategory: string;
  sourceStatus: string;
  sourceType: string;
  status: CommerceImportStatus;
  supplierName: string;
};

type CashExpenseRow = {
  cashbox_name: string;
  created_at: string;
  description: string;
  document_date: string;
  document_number: string | null;
  id: string;
  import_batch_id: string | null;
  legacy_id: string | null;
  notes: string | null;
  payment_method: string | null;
  responsible: string | null;
  source: string;
  status: CashExpenseStatus;
  supplier: string | null;
  total_amount: number | string;
  updated_at: string;
};

type CashExpenseAllocationRow = {
  account_name: string;
  amount: number | string;
  cost_center_name: string;
  detail: string | null;
  document_id: string;
  id: string;
  linked_module: LinkedModule;
  mapping_status: CashExpenseMappingStatus;
  movement_id: string | null;
  source_category: string;
  source_subcategory: string;
};

type CashExpenseImportBatchRow = {
  allocation_count: number | string;
  commerce_count: number | string;
  created_at: string;
  expense_count: number | string;
  file_name: string;
  fingerprint: string;
  id: string;
  imported_by_name: string | null;
  total_amount: number | string;
};

type ImportedCommerceRow = {
  amount: number | string;
  cashbox_name: string | null;
  client_name: string | null;
  created_at: string;
  detail: string | null;
  document_date: string;
  document_number: string | null;
  due_date: string | null;
  id: string;
  import_batch_id: string;
  legacy_id: string | null;
  notes: string | null;
  paid_amount: number | string;
  payment_method: string | null;
  source_category: string | null;
  source_status: string;
  source_type: string;
  status: CommerceImportStatus;
  supplier_name: string | null;
};

export function cashExpenseDocumentFromRow(
  row: CashExpenseRow,
  allocations: CashExpenseAllocation[] = [],
): CashExpenseDocument {
  return {
    allocations,
    cashboxName: row.cashbox_name,
    createdAt: row.created_at,
    description: row.description,
    documentDate: row.document_date,
    documentNumber: row.document_number ?? "",
    id: row.id,
    importBatchId: row.import_batch_id ?? "",
    legacyId: row.legacy_id ?? "",
    notes: row.notes ?? "",
    paymentMethod: row.payment_method ?? "",
    responsible: row.responsible ?? "",
    source: row.source,
    status: row.status,
    supplier: row.supplier ?? "",
    totalAmount: Number(row.total_amount),
    updatedAt: row.updated_at,
  };
}

export function cashExpenseAllocationFromRow(
  row: CashExpenseAllocationRow,
): CashExpenseAllocation {
  return {
    accountName: row.account_name,
    amount: Number(row.amount),
    costCenterName: row.cost_center_name,
    detail: row.detail ?? "",
    documentId: row.document_id,
    id: row.id,
    linkedModule: row.linked_module,
    mappingStatus: row.mapping_status,
    movementId: row.movement_id ?? "",
    sourceCategory: row.source_category,
    sourceSubcategory: row.source_subcategory,
  };
}

export function cashExpenseImportBatchFromRow(
  row: CashExpenseImportBatchRow,
): CashExpenseImportBatch {
  return {
    allocationCount: Number(row.allocation_count),
    commerceCount: Number(row.commerce_count),
    createdAt: row.created_at,
    expenseCount: Number(row.expense_count),
    fileName: row.file_name,
    fingerprint: row.fingerprint,
    id: row.id,
    importedByName: row.imported_by_name ?? "",
    totalAmount: Number(row.total_amount),
  };
}

export function importedCommerceRecordFromRow(
  row: ImportedCommerceRow,
): ImportedCommerceRecord {
  return {
    amount: Number(row.amount),
    cashboxName: row.cashbox_name ?? "",
    clientName: row.client_name ?? "",
    createdAt: row.created_at,
    detail: row.detail ?? "",
    documentDate: row.document_date,
    documentNumber: row.document_number ?? "",
    dueDate: row.due_date ?? "",
    id: row.id,
    importBatchId: row.import_batch_id,
    legacyId: row.legacy_id ?? "",
    notes: row.notes ?? "",
    paidAmount: Number(row.paid_amount),
    paymentMethod: row.payment_method ?? "",
    sourceCategory: row.source_category ?? "",
    sourceStatus: row.source_status,
    sourceType: row.source_type,
    status: row.status,
    supplierName: row.supplier_name ?? "",
  };
}
