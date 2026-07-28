"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  financeCategories,
  linkedModules,
  paymentMethods,
  type FinanceMovement,
} from "@/lib/company-data";

const DELETE_LIMIT = 50;

export function FinanceRecordMaintenance({
  canAdmin,
  cashboxes,
  costCenters,
  financeAccounts,
  money,
  movements,
  onDeleted,
  onOpenSource,
  onUpdated,
}: {
  canAdmin: boolean;
  cashboxes: string[];
  costCenters: string[];
  financeAccounts: string[];
  money: (value: number) => string;
  movements: FinanceMovement[];
  onDeleted: (ids: string[]) => void;
  onOpenSource: (source: string) => void;
  onUpdated: (movement: FinanceMovement) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sourceFilter, setSourceFilter] = useState("todos");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [editing, setEditing] = useState<FinanceMovement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const records = useMemo(
    () =>
      [...movements].sort(
        (first, second) =>
          second.movementDate.localeCompare(first.movementDate) ||
          second.createdAt.localeCompare(first.createdAt),
      ),
    [movements],
  );
  const sources = useMemo(
    () =>
      Array.from(
        new Set(records.map((movement) => movement.sourceModule || "manual")),
      ).sort((first, second) => first.localeCompare(second, "es")),
    [records],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredRecords = records.filter((movement) => {
    const matchesSearch =
      !normalizedSearch ||
      [
        movement.concept,
        movement.documentNumber,
        movement.cashboxName,
        movement.accountName,
        movement.costCenterName,
        movement.linkedModule,
        movement.responsible,
        movement.relatedParty,
      ].some((value) =>
        value.toLocaleLowerCase("es").includes(normalizedSearch),
      );
    const matchesStatus =
      statusFilter === "todos" || movement.status === statusFilter;
    const matchesSource =
      sourceFilter === "todos" || movement.sourceModule === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource;
  });
  const selectableRecords = filteredRecords.slice(0, DELETE_LIMIT);
  const selectedRecords = records.filter((movement) =>
    selectedIds.includes(movement.id),
  );
  const allVisibleSelected =
    selectableRecords.length > 0 &&
    selectableRecords.every((movement) => selectedIds.includes(movement.id));
  const selectedAmount = selectedRecords.reduce(
    (total, movement) => total + movement.amount,
    0,
  );

  function toggleMovement(movementId: string) {
    setSelectedIds((current) =>
      current.includes(movementId)
        ? current.filter((id) => id !== movementId)
        : [...current, movementId].slice(-DELETE_LIMIT),
    );
    clearFeedback();
  }

  function toggleAllVisible() {
    const visibleIds = selectableRecords.map((movement) => movement.id);
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])).slice(
            -DELETE_LIMIT,
          ),
    );
    clearFeedback();
  }

  function openConfirmation() {
    if (!selectedRecords.length) return;
    setConfirmation("");
    clearFeedback();
    setConfirmationOpen(true);
  }

  function openEditor(movement: FinanceMovement) {
    clearFeedback();
    setEditing({ ...movement });
  }

  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/movements", {
        body: JSON.stringify({ action: "edit", movement: editing }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as {
        error?: string;
        movement?: FinanceMovement;
      };

      if (!response.ok || !payload.movement) {
        throw new Error(payload.error ?? "No se pudo actualizar el registro.");
      }

      onUpdated(payload.movement);
      setEditing(null);
      setMessage("Registro financiero actualizado.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo actualizar el registro.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== "ELIMINAR") return;

    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/finance/movements", {
        body: JSON.stringify({
          confirmation,
          ids: selectedRecords.map((movement) => movement.id),
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
        } eliminado${payload.deletedIds.length === 1 ? "" : "s"}.`,
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

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  return (
    <section className="panel wide finance-example-cleanup">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Mantenimiento general</p>
          <h3>Registros financieros</h3>
        </div>
        <span className="finance-example-count">
          {records.length} registro{records.length === 1 ? "" : "s"}
        </span>
      </div>

      <p className="finance-maintenance-help">
        Consulte, corrija o elimine movimientos reales y de prueba. Los cambios
        afectan inmediatamente las cajas y los reportes. Los registros
        vinculados se administran desde su bloque de origen.
      </p>

      {message && <div className="status-banner success">{message}</div>}
      {error && !confirmationOpen && !editing && (
        <div className="status-banner danger">{error}</div>
      )}
      {!canAdmin && (
        <div className="status-banner locked">
          Solo un administrador puede editar o eliminar registros financieros.
        </div>
      )}

      <div className="finance-maintenance-filters">
        <label>
          Buscar
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Concepto, comprobante, caja..."
            type="search"
            value={search}
          />
        </label>
        <label>
          Estado
          <select
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="todos">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmado">Confirmado</option>
            <option value="anulado">Anulado</option>
          </select>
        </label>
        <label>
          Origen
          <select
            onChange={(event) => setSourceFilter(event.target.value)}
            value={sourceFilter}
          >
            <option value="todos">Todos</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {sourceLabel(source)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          onClick={() => {
            setSearch("");
            setStatusFilter("todos");
            setSourceFilter("todos");
          }}
          type="button"
        >
          Limpiar filtros
        </button>
      </div>

      <div className="finance-example-toolbar">
        <label>
          <input
            checked={allVisibleSelected}
            disabled={!canAdmin || !selectableRecords.length}
            onChange={toggleAllVisible}
            type="checkbox"
          />
          Seleccionar visibles
        </label>
        <div>
          <span>
            {filteredRecords.length} encontrados · {selectedRecords.length} seleccionados
          </span>
          <button
            className="danger-button"
            disabled={!canAdmin || !selectedRecords.length}
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
              <th>Clasificacion</th>
              <th>Origen</th>
              <th>Estado</th>
              <th>Monto</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length ? (
              filteredRecords.map((movement) => (
                <tr key={movement.id}>
                  <td>
                    <input
                      aria-label={`Seleccionar ${movement.concept}`}
                      checked={selectedIds.includes(movement.id)}
                      disabled={
                        !canAdmin ||
                        (!selectedIds.includes(movement.id) &&
                          selectedIds.length >= DELETE_LIMIT)
                      }
                      onChange={() => toggleMovement(movement.id)}
                      type="checkbox"
                    />
                  </td>
                  <td>{formatDate(movement.movementDate)}</td>
                  <td>
                    <strong>{movement.concept}</strong>
                    <small>{movement.documentNumber || "Sin comprobante"}</small>
                  </td>
                  <td>{movement.cashboxName}</td>
                  <td>
                    <strong>{movement.accountName}</strong>
                    <small>{movement.costCenterName}</small>
                  </td>
                  <td>
                    <span className="finance-source-badge">
                      {sourceLabel(movement.sourceModule)}
                    </span>
                  </td>
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
                  <td>
                    {isManagedSource(movement.sourceModule) ? (
                      <button
                        className="small-action-button"
                        disabled={!canAdmin}
                        onClick={() => onOpenSource(movement.sourceModule)}
                        type="button"
                      >
                        Abrir origen
                      </button>
                    ) : (
                      <button
                        className="small-action-button"
                        disabled={!canAdmin}
                        onClick={() => openEditor(movement)}
                        type="button"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="finance-example-empty" colSpan={9}>
                  No hay registros que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="hr-modal-backdrop" role="presentation">
          <section
            aria-labelledby="finance-record-edit-title"
            aria-modal="true"
            className="hr-modal finance-record-edit-modal"
            role="dialog"
          >
            <div className="hr-modal-heading">
              <div>
                <p className="eyebrow">Edicion administrativa</p>
                <h3 id="finance-record-edit-title">Editar movimiento</h3>
              </div>
              <button
                aria-label="Cerrar"
                className="hr-close-button"
                disabled={saving}
                onClick={() => setEditing(null)}
                type="button"
              >
                X
              </button>
            </div>
            <form className="finance-record-edit-form" onSubmit={saveMovement}>
              {error && <div className="status-banner danger">{error}</div>}
              <div className="finance-record-context">
                <span>Origen: {sourceLabel(editing.sourceModule)}</span>
                <span>Estado: {statusLabel(editing.status)}</span>
              </div>
              <div className="finance-record-form-grid">
                <label>
                  Tipo
                  <select
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        movementType: event.target
                          .value as FinanceMovement["movementType"],
                      })
                    }
                    value={editing.movementType}
                  >
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </label>
                <label>
                  Fecha
                  <input
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({ ...editing, movementDate: event.target.value })
                    }
                    required
                    type="date"
                    value={editing.movementDate}
                  />
                </label>
                <label>
                  Caja
                  <select
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({ ...editing, cashboxName: event.target.value })
                    }
                    value={editing.cashboxName}
                  >
                    {optionValues(cashboxes, editing.cashboxName).map((cashbox) => (
                      <option key={cashbox}>{cashbox}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Modulo
                  <select
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        linkedModule: event.target
                          .value as FinanceMovement["linkedModule"],
                      })
                    }
                    value={editing.linkedModule}
                  >
                    {linkedModules.map((module) => (
                      <option key={module}>{module}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Cuenta contable
                  <select
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({ ...editing, accountName: event.target.value })
                    }
                    value={editing.accountName}
                  >
                    {optionValues(financeAccounts, editing.accountName).map(
                      (account) => (
                        <option key={account}>{account}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Centro de costo
                  <select
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        costCenterName: event.target.value,
                      })
                    }
                    value={editing.costCenterName}
                  >
                    {optionValues(costCenters, editing.costCenterName).map(
                      (center) => (
                        <option key={center}>{center}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Categoria
                  <select
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({ ...editing, category: event.target.value })
                    }
                    value={editing.category}
                  >
                    {optionValues(financeCategories, editing.category).map(
                      (category) => (
                        <option key={category}>{category}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Monto
                  <input
                    disabled={saving}
                    min="1"
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        amount: Number(event.target.value),
                      })
                    }
                    required
                    type="number"
                    value={editing.amount}
                  />
                </label>
                <label className="wide-field">
                  Concepto
                  <input
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({ ...editing, concept: event.target.value })
                    }
                    required
                    value={editing.concept}
                  />
                </label>
                <label>
                  Medio de pago
                  <select
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        paymentMethod: event.target.value,
                      })
                    }
                    value={editing.paymentMethod}
                  >
                    <option value="">Sin especificar</option>
                    {optionValues(
                      paymentMethods,
                      editing.paymentMethod,
                    ).map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Comprobante
                  <input
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        documentNumber: event.target.value,
                      })
                    }
                    value={editing.documentNumber}
                  />
                </label>
                <label>
                  Responsable
                  <input
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        responsible: event.target.value,
                      })
                    }
                    value={editing.responsible}
                  />
                </label>
                <label>
                  Cliente o proveedor
                  <input
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        relatedParty: event.target.value,
                      })
                    }
                    value={editing.relatedParty}
                  />
                </label>
                <label className="wide-field">
                  Objeto de costo
                  <input
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        costObjectName: event.target.value,
                      })
                    }
                    placeholder="Vehiculo, persona, obra o lote"
                    value={editing.costObjectName ?? ""}
                  />
                </label>
                <label className="wide-field">
                  Observaciones
                  <textarea
                    disabled={saving}
                    onChange={(event) =>
                      setEditing({ ...editing, notes: event.target.value })
                    }
                    value={editing.notes}
                  />
                </label>
              </div>
              <div className="hr-modal-actions">
                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => setEditing(null)}
                  type="button"
                >
                  Cancelar
                </button>
                <button className="submit-button" disabled={saving} type="submit">
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

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
                <h3 id="finance-cleanup-title">Eliminar registros financieros</h3>
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
            <form
              className="finance-cleanup-confirmation"
              onSubmit={deleteRecords}
            >
              {error && <div className="status-banner danger">{error}</div>}
              <div className="status-banner danger">
                Esta accion no se puede deshacer y cambia los saldos historicos.
              </div>
              <div className="finance-cleanup-summary">
                <div>
                  <span>Registros</span>
                  <strong>{selectedRecords.length}</strong>
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

function optionValues(values: string[], current: string) {
  return Array.from(new Set([current, ...values].filter(Boolean)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function sourceLabel(source: string) {
  return (
    {
      cuentas_por_cobrar: "Cuentas por cobrar",
      cuentas_por_pagar: "Cuentas por pagar",
      gastos_caja: "Gastos de caja",
      manual: "Carga manual",
    }[source] ??
    source.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

function isManagedSource(source: string) {
  return [
    "cuentas_por_cobrar",
    "cuentas_por_pagar",
    "gastos_caja",
  ].includes(source);
}

function statusLabel(status: FinanceMovement["status"]) {
  return {
    anulado: "Anulado",
    borrador: "Borrador",
    confirmado: "Confirmado",
    pendiente: "Pendiente",
  }[status];
}
