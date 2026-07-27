export type MonthlyClosingStatus =
  | "abierto"
  | "revision"
  | "aprobado"
  | "cerrado";

export type MonthlyClosingItemStatus =
  | "pendiente"
  | "preparado"
  | "revisado"
  | "aprobado";

export type MonthlyClosing = {
  approvedAt: string;
  approvedBy: string;
  closedAt: string;
  closedBy: string;
  createdAt: string;
  createdBy: string;
  financeSnapshot: Record<string, unknown>;
  id: string;
  nextMonthPending: string;
  notes: string;
  period: string;
  status: MonthlyClosingStatus;
  submittedAt: string;
  updatedAt: string;
};

export type MonthlyClosingItem = {
  closingId: string;
  id: string;
  notes: string;
  reportKey: string;
  responsibleName: string;
  sourceModule: string;
  status: MonthlyClosingItemStatus;
  title: string;
  updatedAt: string;
  updatedBy: string;
};

export type ClosingReportDefinition = {
  detail: string;
  key: string;
  number: number;
  sourceModule: string;
  title: string;
};

export const closingReportDefinitions: ClosingReportDefinition[] = [
  {
    detail:
      "Ingresos, gastos, resultado, obligaciones, ventas, existencias y pendientes.",
    key: "resumen_general",
    number: 1,
    sourceModule: "Cierres",
    title: "Resumen general",
  },
  {
    detail: "Liquidacion ganadera, agricola y de maquinarias.",
    key: "ingresos_ventas_sector",
    number: 2,
    sourceModule: "Financiero",
    title: "Ingresos y ventas por sector",
  },
  {
    detail:
      "Gastos clasificados, presupuesto, gasto real y variacion por sector.",
    key: "gastos_sector",
    number: 3,
    sourceModule: "Financiero",
    title: "Gastos por sector",
  },
  {
    detail:
      "Saldos iniciales y finales, movimientos, anticipos y rendiciones.",
    key: "caja_bancos",
    number: 4,
    sourceModule: "Financiero",
    title: "Caja y bancos",
  },
  {
    detail:
      "Clientes, vencimientos, cobros parciales, atrasos y responsables.",
    key: "cuentas_cobrar",
    number: 5,
    sourceModule: "Financiero",
    title: "Cuentas por cobrar",
  },
  {
    detail:
      "Proveedores, comprobantes, pagos, saldos y sector correspondiente.",
    key: "cuentas_pagar",
    number: 6,
    sourceModule: "Financiero",
    title: "Cuentas por pagar",
  },
  {
    detail:
      "Saldo inicial, compras, consumos, ajustes, conteo fisico y valorizacion.",
    key: "inventario",
    number: 7,
    sourceModule: "Deposito",
    title: "Inventario",
  },
  {
    detail:
      "Existencias por categoria, mapa, nacimientos, traslados, ventas y bajas.",
    key: "hato_ganadero",
    number: 8,
    sourceModule: "Ganadero",
    title: "Hato ganadero",
  },
  {
    detail:
      "Pesos, ganancia diaria, consumo y costo de alimentacion por lote.",
    key: "productivo_ganadero",
    number: 9,
    sourceModule: "Ganadero",
    title: "Productividad ganadera",
  },
  {
    detail:
      "Uso, combustible, operadores, mantenimientos, alertas y costo por equipo.",
    key: "combustible_maquinarias",
    number: 10,
    sourceModule: "Maquinarias",
    title: "Combustible y maquinarias",
  },
  {
    detail:
      "Plantel, asistencia, novedades, horas extra, descuentos y salarios.",
    key: "personal_salarios",
    number: 11,
    sourceModule: "Recursos Humanos",
    title: "Personal y salarios",
  },
  {
    detail:
      "Presupuesto, gasto, avance, materiales, responsables y fecha prevista.",
    key: "obras_inversiones",
    number: 12,
    sourceModule: "Obras y Trabajos",
    title: "Obras e inversiones",
  },
  {
    detail:
      "Trabajos programados y realizados, recursos, demoras y avance.",
    key: "trabajos_realizados",
    number: 13,
    sourceModule: "Obras y Trabajos",
    title: "Trabajos realizados",
  },
  {
    detail:
      "Indicadores financieros, productivos, ganaderos, laborales y de obras.",
    key: "indicadores_mensuales",
    number: 14,
    sourceModule: "Cierres",
    title: "Indicadores mensuales",
  },
];

type Row = Record<string, unknown>;

export function monthlyClosingFromRow(row: Row): MonthlyClosing {
  return {
    approvedAt: text(row.approved_at),
    approvedBy: text(row.approved_by_name),
    closedAt: text(row.closed_at),
    closedBy: text(row.closed_by_name),
    createdAt: text(row.created_at),
    createdBy: text(row.created_by_name),
    financeSnapshot: object(row.finance_snapshot),
    id: text(row.id),
    nextMonthPending: text(row.next_month_pending),
    notes: text(row.notes),
    period: text(row.period_start).slice(0, 7),
    status: closingStatus(row.status),
    submittedAt: text(row.submitted_at),
    updatedAt: text(row.updated_at),
  };
}

export function monthlyClosingItemFromRow(row: Row): MonthlyClosingItem {
  return {
    closingId: text(row.closing_id),
    id: text(row.id),
    notes: text(row.notes),
    reportKey: text(row.report_key),
    responsibleName: text(row.responsible_name),
    sourceModule: text(row.source_module),
    status: itemStatus(row.status),
    title: text(row.title),
    updatedAt: text(row.updated_at),
    updatedBy: text(row.updated_by_name),
  };
}

function closingStatus(value: unknown): MonthlyClosingStatus {
  return value === "revision" ||
    value === "aprobado" ||
    value === "cerrado"
    ? value
    : "abierto";
}

function itemStatus(value: unknown): MonthlyClosingItemStatus {
  return value === "preparado" ||
    value === "revisado" ||
    value === "aprobado"
    ? value
    : "pendiente";
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}
