"use client";

import { FormEvent, useMemo, useState } from "react";
import type { FinanceMovement } from "@/lib/company-data";
import { isExampleFinanceMovement } from "@/lib/finance-examples";

export function FinanceExampleCleanup({
  canAdmin,
  money,
  movements,
  onDeleted,
}: {
  canAdmin: boolean;
  money: (value: number) => string;
  movements: FinanceMovement[];
  onDeleted: (ids: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const examples = useMemo(
    () =>
      movements
        .filter(isExampleFinanceMovement)
        .sort(
          (first, second) =>
            second.movementDate.localeCompare(first.movementDate) ||
            second.createdAt.localeCompare(first.createdAt),
        ),
    [movements],
  );
  const selectedExamples = examples.filter((movement) =>
    selectedIds.includes(movement.id),
  );
  const allSelected =
    examples.length > 0 && selectedExamples.length === examples.length;
  const selectedAmount = selectedExamples.reduce(
    (total, movement) => total + movement.amount,
    0,
  );

  function toggleMovement(movementId: string) {
    setSelectedIds((current) =>
      current.includes(movementId)
        ? current.filter((id) => id !== movementId)
        : [...current, movementId],
    );
    setMessage("");
    setError("");
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : examples.map((movement) => movement.id));
    setMessage("");
    setError("");
  }

  function openConfirmation() {
    if (!selectedExamples.length) return;
    setConfirmation("");
    setError("");
    setMessage("");
    setConfirmationOpen(true);
  }

  async function deleteExamples(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== "ELIMINAR") return;

    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/finance/movements", {
        body: JSON.stringify({
          confirmation,
          ids: selectedExamples.map((movement) => movement.id),
        }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        deletedIds?: string[];
        error?: string;
      };

      if (!response.ok || !payload.deletedIds) {
        throw new Error(
          payload.error ?? "No se pudieron eliminar los registros.",
        );
      }

      onDeleted(payload.deletedIds);
      setSelectedIds([]);
      setConfirmationOpen(false);
      setMessage(
        `${payload.deletedIds.length} registro${
          payload.deletedIds.length === 1 ? "" : "s"
        } de ejemplo eliminado${
          payload.deletedIds.length === 1 ? "" : "s"
        }.`,
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudieron eliminar los registros.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="panel wide finance-example-cleanup">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Mantenimiento</p>
          <h3>Registros financieros de ejemplo</h3>
        </div>
        <span className="finance-example-count">
          {examples.length} detectado{examples.length === 1 ? "" : "s"}
        </span>
      </div>

      {message && <div className="status-banner success">{message}</div>}
      {error && !confirmationOpen && (
        <div className="status-banner danger">{error}</div>
      )}
      {!canAdmin && (
        <div className="status-banner locked">
          Solo un administrador puede eliminar registros financieros.
        </div>
      )}

      <div className="finance-example-toolbar">
        <label>
          <input
            checked={allSelected}
            disabled={!canAdmin || !examples.length}
            onChange={toggleAll}
            type="checkbox"
          />
          Seleccionar todos
        </label>
        <div>
          <span>{selectedExamples.length} seleccionados</span>
          <button
            className="danger-button"
            disabled={!canAdmin || !selectedExamples.length}
            onClick={openConfirmation}
            type="button"
          >
            Eliminar seleccionados
          </button>
        </div>
      </div>

      <div className="table-wrap finance-example-table">
        <table>
          <thead>
            <tr>
              <th aria-label="Seleccionar" />
              <th>Fecha</th>
              <th>Movimiento</th>
              <th>Caja</th>
              <th>Comprobante</th>
              <th>Estado</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {examples.length ? (
              examples.map((movement) => (
                <tr key={movement.id}>
                  <td>
                    <input
                      aria-label={`Seleccionar ${movement.concept}`}
                      checked={selectedIds.includes(movement.id)}
                      disabled={!canAdmin}
                      onChange={() => toggleMovement(movement.id)}
                      type="checkbox"
                    />
                  </td>
                  <td>{formatDate(movement.movementDate)}</td>
                  <td>
                    <strong>{movement.concept}</strong>
                    <small>{movement.linkedModule}</small>
                  </td>
                  <td>{movement.cashboxName}</td>
                  <td>{movement.documentNumber || "-"}</td>
                  <td>
                    <span className={`status-badge ${movement.status}`}>
                      {statusLabel(movement.status)}
                    </span>
                  </td>
                  <td>
                    <strong
                      className={
                        movement.movementType === "ingreso"
                          ? "positive"
                          : "negative"
                      }
                    >
                      {movement.movementType === "ingreso" ? "+" : "-"}
                      {money(movement.amount)}
                    </strong>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="finance-example-empty" colSpan={7}>
                  No se detectaron registros financieros de ejemplo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmationOpen && (
        <div className="hr-modal-backdrop" role="presentation">
          <section
            aria-labelledby="finance-cleanup-title"
            aria-modal="true"
            className="hr-modal finance-cleanup-modal"
            role="dialog"
          >
            <div className="hr-modal-heading">
              <div>
                <p className="eyebrow">Eliminacion permanente</p>
                <h3 id="finance-cleanup-title">
                  Eliminar registros de ejemplo
                </h3>
              </div>
              <button
                aria-label="Cerrar"
                className="hr-close-button"
                disabled={deleting}
                onClick={() => setConfirmationOpen(false)}
                type="button"
              >
                X
              </button>
            </div>
            <form className="finance-cleanup-confirmation" onSubmit={deleteExamples}>
              {error && <div className="status-banner danger">{error}</div>}
              <div className="finance-cleanup-summary">
                <div>
                  <span>Registros</span>
                  <strong>{selectedExamples.length}</strong>
                </div>
                <div>
                  <span>Monto referencial</span>
                  <strong>{money(selectedAmount)}</strong>
                </div>
              </div>
              <label>
                Escriba ELIMINAR para confirmar
                <input
                  autoComplete="off"
                  disabled={deleting}
                  onChange={(event) => setConfirmation(event.target.value)}
                  value={confirmation}
                />
              </label>
              <div className="hr-modal-actions">
                <button
                  className="secondary-button"
                  disabled={deleting}
                  onClick={() => setConfirmationOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="danger-button"
                  disabled={deleting || confirmation !== "ELIMINAR"}
                  type="submit"
                >
                  {deleting ? "Eliminando..." : "Eliminar permanentemente"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function statusLabel(status: FinanceMovement["status"]) {
  return {
    anulado: "Anulado",
    borrador: "Borrador",
    confirmado: "Confirmado",
    pendiente: "Pendiente",
  }[status];
}
