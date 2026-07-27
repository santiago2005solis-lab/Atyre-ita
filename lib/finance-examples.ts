import {
  demoFinanceMovements,
  type FinanceMovement,
} from "./company-data";

type ExampleSignature = Pick<
  FinanceMovement,
  | "amount"
  | "cashboxName"
  | "concept"
  | "documentNumber"
  | "movementDate"
>;

const additionalExamples: ExampleSignature[] = [
  {
    amount: 15_000_000,
    cashboxName: "Caja Ganadero Confinamiento",
    concept: "Venta Toros 22 07 2026",
    documentNumber: "00001",
    movementDate: "2026-07-22",
  },
];

const exampleSignatures: ExampleSignature[] = [
  ...demoFinanceMovements,
  ...additionalExamples,
];

export function isExampleFinanceMovement(movement: FinanceMovement) {
  return exampleSignatures.some(
    (example) =>
      example.amount === movement.amount &&
      normalize(example.cashboxName) === normalize(movement.cashboxName) &&
      normalize(example.concept) === normalize(movement.concept) &&
      normalize(example.documentNumber) ===
        normalize(movement.documentNumber) &&
      example.movementDate === movement.movementDate,
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
