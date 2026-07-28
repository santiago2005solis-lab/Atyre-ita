import type { AppUser } from "./permissions";

export type StorageMode = "demo" | "supabase";

export type FinanceMovementType = "ingreso" | "egreso" | "transferencia";
export type FinanceMovementStatus = "borrador" | "pendiente" | "confirmado" | "anulado";
export type LinkedModule =
  | "Ganadero"
  | "Agricola"
  | "Maquinarias"
  | "Recursos Humanos"
  | "Financiero"
  | "Deposito"
  | "General";
export type InventoryMovementType = "entrada" | "salida" | "traslado" | "ajuste";

export type CostCenterDefinition = {
  code: string;
  description: string;
  linkedModule: LinkedModule;
  name: string;
  type: "administrativo" | "agricola" | "ganadero" | "inversion";
};

export type FinanceMovement = {
  id: string;
  accountName: string;
  cashboxName: string;
  costObjectName?: string;
  costCenterName: string;
  movementType: FinanceMovementType;
  movementDate: string;
  concept: string;
  category: string;
  amount: number;
  currency: "PYG";
  linkedModule: LinkedModule;
  paymentMethod: string;
  documentNumber: string;
  responsible: string;
  relatedParty: string;
  sourceModule: string;
  status: FinanceMovementStatus;
  notes: string;
  createdAt: string;
};

export type InventoryItem = {
  id: string;
  warehouseName: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minStock: number;
  unitCost: number;
  supplier: string;
  updatedAt: string;
};

export type InventoryMovement = {
  id: string;
  itemId: string;
  warehouseName: string;
  targetWarehouseName: string;
  movementType: InventoryMovementType;
  movementDate: string;
  quantity: number;
  unitCost: number;
  documentNumber: string;
  responsible: string;
  notes: string;
  createdAt: string;
};

export type HrEmployee = {
  id: string;
  fullName: string;
  documentNumber: string;
  role: string;
  department: string;
  status: "activo" | "licencia" | "inactivo";
  startDate: string;
  salaryType: "mensual" | "jornal";
  monthlySalary: number;
  dailyWage: number;
  notes: string;
};

export type AppData = {
  currentUser?: AppUser;
  storageMode: StorageMode;
  storageMessage?: string;
  storageError?: string;
  cashboxes: string[];
  costCenters: string[];
  financeAccounts: string[];
  warehouses: string[];
  financeMovements: FinanceMovement[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  hrEmployees: HrEmployee[];
};

export const cashboxes = [
  "Caja Central",
  "Caja CDE",
  "Caja Particular",
];

export function isOperationalCashbox(value: unknown): value is string {
  return (
    typeof value === "string" &&
    cashboxes.includes(value.trim())
  );
}

export const linkedModules: LinkedModule[] = [
  "Ganadero",
  "Agricola",
  "Maquinarias",
  "Recursos Humanos",
  "Financiero",
  "Deposito",
  "General",
];

export const financeAccounts = [
  "Venta de ganado",
  "Venta agricola",
  "Servicios y alquileres",
  "Compra de ganado",
  "Alimento animal",
  "Sanidad animal",
  "Insumos agricolas",
  "Combustible",
  "Mantenimiento de maquinarias",
  "Repuestos",
  "Sueldos y jornales",
  "Deposito e inventario",
  "Servicios generales",
  "Transferencias internas",
  "Inversiones",
  "Otros",
];

export const costCenterCatalog: CostCenterDefinition[] = [
  {
    code: "GAN-CONF-15",
    description: "Produccion ganadera del confinamiento de 15 HAS",
    linkedModule: "Ganadero",
    name: "Confinamiento 15 HAS",
    type: "ganadero",
  },
  {
    code: "GAN-CONF-500",
    description: "Produccion ganadera del confinamiento de 500 HAS",
    linkedModule: "Ganadero",
    name: "Confinamiento 500 HAS",
    type: "ganadero",
  },
  {
    code: "GAN-PAS-CAP",
    description: "Produccion ganadera a pasto del sector Capitan",
    linkedModule: "Ganadero",
    name: "Pastoreo Capitan",
    type: "ganadero",
  },
  {
    code: "GAN-PAS-VIL",
    description: "Produccion ganadera a pasto del sector Villagra",
    linkedModule: "Ganadero",
    name: "Pastoreo Villagra",
    type: "ganadero",
  },
  {
    code: "GAN-PAS-ALO",
    description: "Produccion ganadera a pasto del sector Alonso",
    linkedModule: "Ganadero",
    name: "Pastoreo Alonso",
    type: "ganadero",
  },
  {
    code: "INV-GRAL",
    description: "Obras, maquinarias e inversiones de capital",
    linkedModule: "Financiero",
    name: "Inversiones",
    type: "inversion",
  },
  {
    code: "AGR-CAP",
    description: "Produccion agricola del sector Capiazu",
    linkedModule: "Agricola",
    name: "Agricola Capiazu",
    type: "agricola",
  },
  {
    code: "AGR-BRI",
    description: "Produccion agricola del sector Brizantha",
    linkedModule: "Agricola",
    name: "Agricola Brizantha",
    type: "agricola",
  },
  {
    code: "ADM-GRAL",
    description: "Administracion, personal y gastos generales",
    linkedModule: "Financiero",
    name: "Administracion",
    type: "administrativo",
  },
];

export const costCenters = costCenterCatalog.map((center) => center.name);

export function isOperationalCostCenter(value: unknown): value is string {
  return (
    typeof value === "string" &&
    costCenters.includes(value.trim())
  );
}

export const warehouses = [
  "Deposito Capitan",
  "Deposito Villagra",
  "Deposito Confinamiento 15 HAS",
  "Confinamiento 500 HAS",
];

export const financeCategories = [
  "Venta",
  "Compra",
  "Alimento",
  "Sanidad",
  "Combustible",
  "Personal",
  "Mantenimiento",
  "Agricola",
  "Inversion",
  "Transferencia interna",
  "Otros",
];

export const paymentMethods = [
  "Efectivo",
  "Transferencia bancaria",
  "Cheque",
  "Tarjeta",
  "Credito proveedor",
];

export const inventoryCategories = [
  "Alimento",
  "Veterinaria",
  "Agricola",
  "Repuestos",
  "Combustible",
  "Herramientas",
  "Otros",
];

export const inventoryUnits = ["kg", "bolsa", "litro", "unidad", "ton", "caja"];

export const demoFinanceMovements: FinanceMovement[] = [
  {
    id: "fin-demo-1",
    accountName: "Venta de ganado",
    cashboxName: "Caja Central",
    costCenterName: "Confinamiento 15 HAS",
    movementType: "ingreso",
    movementDate: "2026-07-21",
    concept: "Venta de novillos terminados",
    category: "Venta",
    amount: 328400000,
    currency: "PYG",
    linkedModule: "Ganadero",
    paymentMethod: "Transferencia bancaria",
    documentNumber: "FV-00128",
    responsible: "Administracion",
    relatedParty: "Frigorifico regional",
    sourceModule: "manual",
    status: "confirmado",
    notes: "Operacion de cierre semanal",
    createdAt: "2026-07-21T13:00:00.000Z",
  },
  {
    id: "fin-demo-2",
    accountName: "Alimento animal",
    cashboxName: "Caja Central",
    costCenterName: "Confinamiento 15 HAS",
    movementType: "egreso",
    movementDate: "2026-07-20",
    concept: "Compra de balanceado terminacion",
    category: "Alimento",
    amount: 68400000,
    currency: "PYG",
    linkedModule: "Ganadero",
    paymentMethod: "Transferencia bancaria",
    documentNumber: "FC-00451",
    responsible: "Compras",
    relatedParty: "Nutricion Campo",
    sourceModule: "manual",
    status: "confirmado",
    notes: "Reposicion mensual",
    createdAt: "2026-07-20T13:00:00.000Z",
  },
  {
    id: "fin-demo-3",
    accountName: "Sanidad animal",
    cashboxName: "Caja Central",
    costCenterName: "Pastoreo Capitan",
    movementType: "egreso",
    movementDate: "2026-07-18",
    concept: "Vacunas y antiparasitario",
    category: "Sanidad",
    amount: 19300000,
    currency: "PYG",
    linkedModule: "Ganadero",
    paymentMethod: "Efectivo",
    documentNumber: "FC-00442",
    responsible: "Encargado campo",
    relatedParty: "Veterinaria Norte",
    sourceModule: "manual",
    status: "confirmado",
    notes: "Plan sanitario trimestral",
    createdAt: "2026-07-18T13:00:00.000Z",
  },
  {
    id: "fin-demo-4",
    accountName: "Insumos agricolas",
    cashboxName: "Caja Central",
    costCenterName: "Agricola Capiazu",
    movementType: "egreso",
    movementDate: "2026-07-17",
    concept: "Semillas y fertilizante",
    category: "Agricola",
    amount: 95800000,
    currency: "PYG",
    linkedModule: "Agricola",
    paymentMethod: "Cheque",
    documentNumber: "FC-00439",
    responsible: "Compras",
    relatedParty: "Agroinsumos Central",
    sourceModule: "manual",
    status: "confirmado",
    notes: "Campana de invierno",
    createdAt: "2026-07-17T13:00:00.000Z",
  },
  {
    id: "fin-demo-5",
    accountName: "Mantenimiento de maquinarias",
    cashboxName: "Caja Central",
    costCenterName: "Agricola Capiazu",
    movementType: "egreso",
    movementDate: "2026-07-15",
    concept: "Mantenimiento de tractor",
    category: "Mantenimiento",
    amount: 22500000,
    currency: "PYG",
    linkedModule: "Maquinarias",
    paymentMethod: "Transferencia bancaria",
    documentNumber: "OS-0097",
    responsible: "Taller",
    relatedParty: "Mecanica Diesel",
    sourceModule: "manual",
    status: "confirmado",
    notes: "Cambio de filtros y reparacion hidraulica",
    createdAt: "2026-07-15T13:00:00.000Z",
  },
  {
    id: "fin-demo-6",
    accountName: "Transferencias internas",
    cashboxName: "Caja Central",
    costCenterName: "Inversiones",
    movementType: "transferencia",
    movementDate: "2026-07-12",
    concept: "Reserva para compra de reproductores",
    category: "Transferencia interna",
    amount: 120000000,
    currency: "PYG",
    linkedModule: "Financiero",
    paymentMethod: "Transferencia bancaria",
    documentNumber: "TR-0021",
    responsible: "Gerencia",
    relatedParty: "Caja Particular",
    sourceModule: "manual",
    status: "confirmado",
    notes: "Movimiento entre cajas",
    createdAt: "2026-07-12T13:00:00.000Z",
  },
];

export const demoInventoryItems: InventoryItem[] = [
  {
    id: "inv-item-1",
    warehouseName: "Deposito Capitan",
    sku: "ALM-001",
    name: "Balanceado terminacion",
    category: "Alimento",
    unit: "kg",
    currentStock: 18450,
    minStock: 8000,
    unitCost: 3100,
    supplier: "Nutricion Campo",
    updatedAt: "2026-07-21T13:00:00.000Z",
  },
  {
    id: "inv-item-2",
    warehouseName: "Deposito Villagra",
    sku: "VET-014",
    name: "Antiparasitario bovino",
    category: "Veterinaria",
    unit: "litro",
    currentStock: 64,
    minStock: 30,
    unitCost: 125000,
    supplier: "Veterinaria Norte",
    updatedAt: "2026-07-20T13:00:00.000Z",
  },
  {
    id: "inv-item-3",
    warehouseName: "Deposito Confinamiento 15 HAS",
    sku: "REP-022",
    name: "Filtro hidraulico",
    category: "Repuestos",
    unit: "unidad",
    currentStock: 11,
    minStock: 8,
    unitCost: 185000,
    supplier: "Mecanica Diesel",
    updatedAt: "2026-07-18T13:00:00.000Z",
  },
  {
    id: "inv-item-4",
    warehouseName: "Confinamiento 500 HAS",
    sku: "AGR-102",
    name: "Fertilizante granulado",
    category: "Agricola",
    unit: "bolsa",
    currentStock: 420,
    minStock: 150,
    unitCost: 168000,
    supplier: "Agroinsumos Central",
    updatedAt: "2026-07-17T13:00:00.000Z",
  },
];

export const demoInventoryMovements: InventoryMovement[] = [
  {
    id: "inv-mov-1",
    itemId: "inv-item-1",
    warehouseName: "Deposito Capitan",
    targetWarehouseName: "",
    movementType: "entrada",
    movementDate: "2026-07-21",
    quantity: 6000,
    unitCost: 3100,
    documentNumber: "RM-0091",
    responsible: "Deposito",
    notes: "Reposicion por compra",
    createdAt: "2026-07-21T13:00:00.000Z",
  },
  {
    id: "inv-mov-2",
    itemId: "inv-item-2",
    warehouseName: "Deposito Villagra",
    targetWarehouseName: "",
    movementType: "salida",
    movementDate: "2026-07-19",
    quantity: 14,
    unitCost: 125000,
    documentNumber: "SM-0033",
    responsible: "Sanidad",
    notes: "Entrega para lote a pasto",
    createdAt: "2026-07-19T13:00:00.000Z",
  },
  {
    id: "inv-mov-3",
    itemId: "inv-item-4",
    warehouseName: "Confinamiento 500 HAS",
    targetWarehouseName: "Deposito Capitan",
    movementType: "traslado",
    movementDate: "2026-07-18",
    quantity: 60,
    unitCost: 168000,
    documentNumber: "TRD-0012",
    responsible: "Logistica",
    notes: "Traslado para siembra",
    createdAt: "2026-07-18T13:00:00.000Z",
  },
];

export const demoHrEmployees: HrEmployee[] = [
  {
    id: "hr-demo-1",
    fullName: "Carlos Benitez",
    documentNumber: "1234567",
    role: "Encargado de campo",
    department: "Ganaderia",
    status: "activo",
    startDate: "2024-02-15",
    salaryType: "mensual",
    monthlySalary: 5200000,
    dailyWage: 0,
    notes: "Responsable de recorridas y novedades",
  },
  {
    id: "hr-demo-2",
    fullName: "Maria Duarte",
    documentNumber: "2345678",
    role: "Auxiliar administrativo",
    department: "Administracion",
    status: "activo",
    startDate: "2025-03-01",
    salaryType: "mensual",
    monthlySalary: 4300000,
    dailyWage: 0,
    notes: "Control documental y archivo",
  },
];

export const demoData: AppData = {
  storageMode: "demo",
  storageMessage: "Modo demo: configure Supabase en Vercel para guardar datos reales.",
  cashboxes,
  costCenters,
  financeAccounts,
  warehouses,
  financeMovements: demoFinanceMovements,
  inventoryItems: demoInventoryItems,
  inventoryMovements: demoInventoryMovements,
  hrEmployees: demoHrEmployees,
};
