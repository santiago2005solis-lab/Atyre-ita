import type { LinkedModule } from "./company-data";

export type FinanceObligationType = "pagar" | "cobrar";
export type FinanceObligationStatus =
  | "pendiente"
  | "parcial"
  | "pagado"
  | "anulado";

export type FinanceObligation = {
  accountName: string;
  amount: number;
  concept: string;
  costCenterName: string;
  createdAt: string;
  createdBy: string;
  documentNumber: string;
  dueDate: string;
  id: string;
  issueDate: string;
  linkedModule: LinkedModule;
  notes: string;
  partyName: string;
  status: FinanceObligationStatus;
  type: FinanceObligationType;
};

export type FinanceObligationSettlement = {
  amount: number;
  cashboxName: string;
  createdAt: string;
  createdBy: string;
  date: string;
  id: string;
  method: string;
  movementId: string;
  notes: string;
  obligationId: string;
  reference: string;
  status: "confirmado" | "anulado";
};

type Row = Record<string, unknown>;

export function financeObligationFromRow(row: Row): FinanceObligation {
  return {
    accountName: text(row.account_name),
    amount: number(row.original_amount),
    concept: text(row.concept),
    costCenterName: text(row.cost_center_name),
    createdAt: text(row.created_at),
    createdBy: text(row.created_by_name),
    documentNumber: text(row.document_number),
    dueDate: text(row.due_date),
    id: text(row.id),
    issueDate: text(row.issue_date),
    linkedModule: linkedModule(row.linked_module),
    notes: text(row.notes),
    partyName: text(row.party_name),
    status: obligationStatus(row.status),
    type: row.obligation_type === "cobrar" ? "cobrar" : "pagar",
  };
}

export function financeSettlementFromRow(
  row: Row,
): FinanceObligationSettlement {
  return {
    amount: number(row.amount),
    cashboxName: text(row.cashbox_name),
    createdAt: text(row.created_at),
    createdBy: text(row.created_by_name),
    date: text(row.settlement_date),
    id: text(row.id),
    method: text(row.payment_method),
    movementId: text(row.movement_id),
    notes: text(row.notes),
    obligationId: text(row.obligation_id),
    reference: text(row.reference),
    status: row.status === "anulado" ? "anulado" : "confirmado",
  };
}

function obligationStatus(value: unknown): FinanceObligationStatus {
  return value === "parcial" || value === "pagado" || value === "anulado"
    ? value
    : "pendiente";
}

function linkedModule(value: unknown): LinkedModule {
  const moduleName = text(value);
  const allowed: LinkedModule[] = [
    "Ganadero",
    "Agricola",
    "Maquinarias",
    "Recursos Humanos",
    "Financiero",
    "Deposito",
    "General",
  ];
  return allowed.includes(moduleName as LinkedModule)
    ? (moduleName as LinkedModule)
    : "General";
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function number(value: unknown) {
  return Number(value ?? 0) || 0;
}
