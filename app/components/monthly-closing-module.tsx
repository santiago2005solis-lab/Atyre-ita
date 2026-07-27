"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  FinanceMovement,
  HrEmployee,
  InventoryItem,
} from "@/lib/company-data";
import type {
  FinanceObligation,
  FinanceObligationSettlement,
} from "@/lib/finance-obligations";
import {
  closingReportDefinitions,
  type MonthlyClosing,
  type MonthlyClosingItem,
  type MonthlyClosingItemStatus,
  type MonthlyClosingStatus,
} from "@/lib/monthly-closing";

type ClosingView = "panel" | "checklist" | "consolidado" | "documentos";

type ClosingPayload = {
  closing: MonthlyClosing | null;
  error?: string;
  items: MonthlyClosingItem[];
  storageMode?: "demo" | "supabase";
};

type ItemDraft = {
  notes: string;
  responsibleName: string;
  status: MonthlyClosingItemStatus;
};

const currentPeriod = localDate().slice(0, 7);

export function MonthlyClosingModule({
  canAdmin,
  canEdit,
  cashboxes,
  financeMovements,
  hrEmployees,
  inventoryItems,
  money,
}: {
  canAdmin: boolean;
  canEdit: boolean;
  cashboxes: string[];
  financeMovements: FinanceMovement[];
  hrEmployees: HrEmployee[];
  inventoryItems: InventoryItem[];
  money: (value: number) => string;
}) {
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [loadedPeriod, setLoadedPeriod] = useState("");
  const [closing, setClosing] = useState<MonthlyClosing | null>(null);
  const [items, setItems] = useState<MonthlyClosingItem[]>([]);
  const [activeView, setActiveView] = useState<ClosingView>("panel");
  const [editingItem, setEditingItem] = useState<MonthlyClosingItem | null>(
    null,
  );
  const [itemDraft, setItemDraft] = useState<ItemDraft>({
    notes: "",
    responsibleName: "",
    status: "pendiente",
  });
  const [obligations, setObligations] = useState<FinanceObligation[]>([]);
  const [settlements, setSettlements] = useState<
    FinanceObligationSettlement[]
  >([]);
  const [obligationNotice, setObligationNotice] = useState("");
  const [notes, setNotes] = useState("");
  const [nextMonthPending, setNextMonthPending] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void requestClosing(selectedPeriod)
      .then((payload) => {
        if (!active) return;
        setClosing(payload.closing);
        setItems(payload.items);
        setNotes(payload.closing?.notes ?? "");
        setNextMonthPending(payload.closing?.nextMonthPending ?? "");
        setError("");
      })
      .catch((loadError) => {
        if (!active) return;
        setClosing(null);
        setItems([]);
        setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoadedPeriod(selectedPeriod);
      });
    return () => {
      active = false;
    };
  }, [selectedPeriod]);

  useEffect(() => {
    let active = true;
    void requestObligations()
      .then((payload) => {
        if (!active) return;
        setObligations(payload.obligations);
        setSettlements(payload.settlements);
        setObligationNotice("");
      })
      .catch(() => {
        if (!active) return;
        setObligationNotice(
          "Las cuentas por pagar y cobrar todavia no estan disponibles.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const liveSummary = useMemo(
    () =>
      buildClosingSummary({
        cashboxes,
        financeMovements,
        hrEmployees,
        inventoryItems,
        obligations,
        period: selectedPeriod,
        settlements,
      }),
    [
      cashboxes,
      financeMovements,
      hrEmployees,
      inventoryItems,
      obligations,
      selectedPeriod,
      settlements,
    ],
  );

  const summary =
    closing?.status === "cerrado" &&
    Object.keys(closing.financeSnapshot).length > 0
      ? snapshotSummary(closing.financeSnapshot, liveSummary)
      : liveSummary;

  const itemCounts = useMemo(
    () => ({
      aprobado: items.filter((item) => item.status === "aprobado").length,
      pendiente: items.filter((item) => item.status === "pendiente").length,
      preparado: items.filter((item) => item.status === "preparado").length,
      revisado: items.filter((item) => item.status === "revisado").length,
    }),
    [items],
  );

  const progress = items.length
    ? Math.round(
        (items.reduce((sum, item) => sum + itemWeight(item.status), 0) /
          items.length) *
          100,
      )
    : 0;
  const loading = loadedPeriod !== selectedPeriod;

  async function createClosing() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/closings", {
        body: JSON.stringify({ period: selectedPeriod }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as ClosingPayload;
      if (!response.ok || !payload.closing) {
        throw new Error(payload.error ?? "No se pudo iniciar el cierre.");
      }
      setClosing(payload.closing);
      setItems(payload.items);
      setNotes(payload.closing.notes);
      setNextMonthPending(payload.closing.nextMonthPending);
      setMessage(`Cierre de ${periodLabel(selectedPeriod)} iniciado.`);
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  function openItem(item: MonthlyClosingItem) {
    setEditingItem(item);
    setItemDraft({
      notes: item.notes,
      responsibleName: item.responsibleName,
      status: item.status,
    });
    setError("");
    setMessage("");
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/closings", {
        body: JSON.stringify({
          action: "update_item",
          itemId: editingItem.id,
          ...itemDraft,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as {
        error?: string;
        item?: MonthlyClosingItem;
        storageMode?: "demo" | "supabase";
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo actualizar el reporte.");
      }
      if (payload.item) {
        setItems((current) =>
          current.map((item) =>
            item.id === payload.item?.id ? payload.item : item,
          ),
        );
      } else {
        setItems((current) =>
          current.map((item) =>
            item.id === editingItem.id ? { ...item, ...itemDraft } : item,
          ),
        );
      }
      setEditingItem(null);
      setMessage("Reporte actualizado.");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function saveClosingNotes() {
    if (!closing) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/closings", {
        body: JSON.stringify({
          action: "update_notes",
          closingId: closing.id,
          nextMonthPending,
          notes,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as {
        closing?: MonthlyClosing;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudieron guardar las notas.");
      }
      setClosing(
        payload.closing ?? {
          ...closing,
          nextMonthPending,
          notes,
        },
      );
      setMessage("Notas del cierre guardadas.");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function transition(target: MonthlyClosingStatus) {
    if (!closing) return;
    const confirmation = transitionConfirmation(target);
    if (confirmation && !window.confirm(confirmation)) return;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/closings", {
        body: JSON.stringify({
          action: "transition",
          closingId: closing.id,
          snapshot: target === "cerrado" ? liveSummary : {},
          status: target,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as ClosingPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo cambiar el estado.");
      }
      if (payload.closing) {
        setClosing(payload.closing);
        setItems(payload.items);
      } else {
        setClosing({
          ...closing,
          financeSnapshot:
            target === "cerrado" ? liveSummary : closing.financeSnapshot,
          status: target,
        });
      }
      setMessage(`Cierre actualizado a ${closingStatusLabel(target)}.`);
    } catch (transitionError) {
      setError(errorMessage(transitionError));
    } finally {
      setSaving(false);
    }
  }

  function exportBackup() {
    if (!closing) return;
    const content = {
      closing,
      generatedAt: new Date().toISOString(),
      items,
      summary,
    };
    const blob = new Blob([JSON.stringify(content, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cierre-${selectedPeriod}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="closing-module">
      <section className="closing-command-bar">
        <div>
          <p className="eyebrow">Control mensual</p>
          <h3>{periodLabel(selectedPeriod)}</h3>
        </div>
        <div className="closing-command-actions">
          <label>
            Periodo
            <input
              onChange={(event) => setSelectedPeriod(event.target.value)}
              type="month"
              value={selectedPeriod}
            />
          </label>
          <span
            className={`closing-status ${
              closing?.status ?? "sin-iniciar"
            }`}
          >
            {loading
              ? "Cargando"
              : closing
                ? closingStatusLabel(closing.status)
                : "Sin iniciar"}
          </span>
          {!closing && canEdit && !loading && (
            <button
              className="submit-button"
              disabled={saving}
              onClick={() => void createClosing()}
              type="button"
            >
              Iniciar cierre
            </button>
          )}
        </div>
      </section>

      <nav className="closing-tabs" aria-label="Bloques de cierre">
        {(
          [
            ["panel", "Panel"],
            ["checklist", "Lista de control"],
            ["consolidado", "Consolidado"],
            ["documentos", "Documentos"],
          ] as Array<[ClosingView, string]>
        ).map(([id, label]) => (
          <button
            aria-pressed={activeView === id}
            className={activeView === id ? "active" : ""}
            key={id}
            onClick={() => setActiveView(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {message && <div className="status-banner success">{message}</div>}
      {error && !editingItem && (
        <div className="status-banner danger">{error}</div>
      )}

      {!closing && !loading ? (
        <section className="panel closing-empty">
          <span>CM</span>
          <div>
            <p className="eyebrow">Periodo disponible</p>
            <h3>{periodLabel(selectedPeriod)}</h3>
            <p>
              Todavia no existe un expediente de cierre para este periodo.
            </p>
          </div>
          {canEdit && (
            <button
              className="submit-button"
              disabled={saving}
              onClick={() => void createClosing()}
              type="button"
            >
              Iniciar cierre
            </button>
          )}
        </section>
      ) : null}

      {closing && activeView === "panel" && (
        <>
          <section className="closing-kpis">
            <ClosingKpi label="Ingresos del mes" value={money(summary.income)} />
            <ClosingKpi
              label="Gastos del mes"
              tone="warning"
              value={money(summary.expense)}
            />
            <ClosingKpi
              label="Resultado"
              tone={summary.result < 0 ? "danger" : "positive"}
              value={money(summary.result)}
            />
            <ClosingKpi label="Avance del cierre" value={`${progress}%`} />
          </section>

          <section className="panel closing-flow-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Flujo de aprobacion</p>
                <h3>Estado del periodo</h3>
              </div>
              <ClosingActions
                canAdmin={canAdmin}
                canEdit={canEdit}
                closing={closing}
                disabled={saving}
                itemCounts={itemCounts}
                onTransition={transition}
              />
            </div>
            <ClosingFlow status={closing.status} />
          </section>

          <div className="closing-dashboard-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Lista de control</p>
                  <h3>Avance de reportes</h3>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => setActiveView("checklist")}
                  type="button"
                >
                  Ver lista
                </button>
              </div>
              <div className="closing-count-grid">
                <ClosingCount
                  label="Pendientes"
                  tone="pending"
                  value={itemCounts.pendiente}
                />
                <ClosingCount
                  label="Preparados"
                  tone="prepared"
                  value={itemCounts.preparado}
                />
                <ClosingCount
                  label="Revisados"
                  tone="reviewed"
                  value={itemCounts.revisado}
                />
                <ClosingCount
                  label="Aprobados"
                  tone="approved"
                  value={itemCounts.aprobado}
                />
              </div>
              <div className="closing-progress">
                <span style={{ width: `${progress}%` }} />
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Control</p>
                  <h3>Alertas del periodo</h3>
                </div>
              </div>
              <div className="closing-alert-list">
                <ClosingAlert
                  detail="movimientos financieros sin confirmar"
                  label="Finanzas"
                  tone={summary.unconfirmedMovements ? "warning" : "ok"}
                  value={summary.unconfirmedMovements}
                />
                <ClosingAlert
                  detail="reportes pendientes de preparar"
                  label="Reportes"
                  tone={itemCounts.pendiente ? "warning" : "ok"}
                  value={itemCounts.pendiente}
                />
                <ClosingAlert
                  detail="articulos actualmente bajo minimo"
                  label="Inventario"
                  tone={summary.lowStock ? "danger" : "ok"}
                  value={summary.lowStock}
                />
              </div>
              {obligationNotice && (
                <p className="closing-inline-notice">{obligationNotice}</p>
              )}
            </section>
          </div>

          <section className="panel closing-notes-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Seguimiento</p>
                <h3>Observaciones y proximo mes</h3>
              </div>
              {canEdit &&
                closing.status !== "aprobado" &&
                closing.status !== "cerrado" && (
                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => void saveClosingNotes()}
                  type="button"
                >
                  Guardar
                </button>
              )}
            </div>
            <div className="closing-notes-grid">
              <label>
                Observaciones del cierre
                <textarea
                  disabled={
                    !canEdit ||
                    closing.status === "aprobado" ||
                    closing.status === "cerrado"
                  }
                  onChange={(event) => setNotes(event.target.value)}
                  value={notes}
                />
              </label>
              <label>
                Principales pendientes del mes siguiente
                <textarea
                  disabled={
                    !canEdit ||
                    closing.status === "aprobado" ||
                    closing.status === "cerrado"
                  }
                  onChange={(event) =>
                    setNextMonthPending(event.target.value)
                  }
                  value={nextMonthPending}
                />
              </label>
            </div>
          </section>
        </>
      )}

      {closing && activeView === "checklist" && (
        <section className="panel closing-checklist-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Expediente mensual</p>
              <h3>Lista de control de reportes</h3>
            </div>
            <span className="closing-report-total">
              {items.length} reportes
            </span>
          </div>
          <div className="table-wrap closing-checklist-table">
            <table>
              <thead>
                <tr>
                  <th>N.</th>
                  <th>Reporte</th>
                  <th>Origen</th>
                  <th>Integracion</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                  <th>Actualizado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {closingReportDefinitions.map((definition) => {
                  const item = items.find(
                    (candidate) =>
                      candidate.reportKey === definition.key,
                  );
                  if (!item) return null;
                  const integration = integrationState(
                    definition.key,
                    summary,
                  );
                  return (
                    <tr key={item.id}>
                      <td>{definition.number}</td>
                      <td>
                        <strong>{definition.title}</strong>
                        <small>{definition.detail}</small>
                      </td>
                      <td>{definition.sourceModule}</td>
                      <td>
                        <span
                          className={`closing-integration ${integration.tone}`}
                        >
                          {integration.label}
                        </span>
                      </td>
                      <td>{item.responsibleName || "Sin asignar"}</td>
                      <td>
                        <span
                          className={`closing-item-status ${item.status}`}
                        >
                          {itemStatusLabel(item.status)}
                        </span>
                      </td>
                      <td>
                        {item.updatedAt
                          ? dateTimeLabel(item.updatedAt)
                          : "-"}
                      </td>
                      <td>
                        <button
                          disabled={
                            !canEdit ||
                            closing.status === "aprobado" ||
                            closing.status === "cerrado" ||
                            (closing.status === "revision" && !canAdmin)
                          }
                          onClick={() => openItem(item)}
                          type="button"
                        >
                          Gestionar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {closing && activeView === "consolidado" && (
        <ClosingConsolidated
          money={money}
          obligationNotice={obligationNotice}
          summary={summary}
        />
      )}

      {closing && activeView === "documentos" && (
        <section className="panel closing-documents">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Archivo mensual</p>
              <h3>Documentos del cierre</h3>
            </div>
            <button
              className="secondary-button"
              onClick={exportBackup}
              type="button"
            >
              Exportar respaldo
            </button>
          </div>
          <div className="closing-document-list">
            <ClosingDocument
              detail="Resumen financiero, avance y principales indicadores."
              ready={closing.status === "cerrado"}
              title="Informe ejecutivo"
            />
            <ClosingDocument
              detail="Detalle de los 14 reportes y responsables."
              ready={itemCounts.aprobado === items.length}
              title="Anexos del cierre"
            />
            <ClosingDocument
              detail="Fotografia de valores y estados del periodo."
              ready={closing.status === "cerrado"}
              title="Respaldo de auditoria"
            />
          </div>
          {closing.status === "cerrado" && (
            <div className="closing-signoff">
              <div>
                <span>Aprobado por</span>
                <strong>{closing.approvedBy || "-"}</strong>
              </div>
              <div>
                <span>Cerrado por</span>
                <strong>{closing.closedBy || "-"}</strong>
              </div>
              <div>
                <span>Fecha de cierre</span>
                <strong>{dateTimeLabel(closing.closedAt)}</strong>
              </div>
            </div>
          )}
        </section>
      )}

      {editingItem && (
        <div className="hr-modal-backdrop" role="presentation">
          <section
            aria-labelledby="closing-item-title"
            aria-modal="true"
            className="hr-modal closing-item-modal"
            role="dialog"
          >
            <div className="hr-modal-heading">
              <div>
                <p className="eyebrow">
                  Reporte {reportNumber(editingItem.reportKey)}
                </p>
                <h3 id="closing-item-title">{editingItem.title}</h3>
              </div>
              <button
                aria-label="Cerrar"
                className="hr-close-button"
                onClick={() => setEditingItem(null)}
                type="button"
              >
                X
              </button>
            </div>
            <form className="hr-employee-form" onSubmit={saveItem}>
              {error && <div className="status-banner danger">{error}</div>}
              <fieldset disabled={saving}>
                <div className="hr-form-grid">
                  <label>
                    Responsable
                    <input
                      onChange={(event) =>
                        setItemDraft((current) => ({
                          ...current,
                          responsibleName: event.target.value,
                        }))
                      }
                      placeholder="Nombre o sector responsable"
                      value={itemDraft.responsibleName}
                    />
                  </label>
                  <label>
                    Estado
                    <select
                      onChange={(event) =>
                        setItemDraft((current) => ({
                          ...current,
                          status: event.target
                            .value as MonthlyClosingItemStatus,
                        }))
                      }
                      value={itemDraft.status}
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="preparado">Preparado</option>
                      {canAdmin && (
                        <option value="revisado">Revisado</option>
                      )}
                      {canAdmin && (
                        <option value="aprobado">Aprobado</option>
                      )}
                    </select>
                  </label>
                  <label className="hr-span-2">
                    Observaciones
                    <textarea
                      onChange={(event) =>
                        setItemDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      value={itemDraft.notes}
                    />
                  </label>
                </div>
                <div className="hr-modal-actions">
                  <button
                    className="secondary-button"
                    onClick={() => setEditingItem(null)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button className="submit-button" type="submit">
                    {saving ? "Guardando..." : "Guardar reporte"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function ClosingKpi({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "danger" | "positive" | "warning";
  value: string;
}) {
  return (
    <article className={tone ?? ""}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ClosingCount({
  label,
  tone,
  value,
}: {
  label: string;
  tone: string;
  value: number;
}) {
  return (
    <div className={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ClosingAlert({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "danger" | "ok" | "warning";
  value: number;
}) {
  return (
    <article className={tone}>
      <span aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <small>
          {value} {detail}
        </small>
      </div>
    </article>
  );
}

function ClosingFlow({ status }: { status: MonthlyClosingStatus }) {
  const order: MonthlyClosingStatus[] = [
    "abierto",
    "revision",
    "aprobado",
    "cerrado",
  ];
  const currentIndex = order.indexOf(status);
  return (
    <div className="closing-flow">
      {order.map((step, index) => (
        <div
          className={
            index < currentIndex
              ? "complete"
              : index === currentIndex
                ? "current"
                : ""
          }
          key={step}
        >
          <span>{index + 1}</span>
          <strong>{closingStatusLabel(step)}</strong>
        </div>
      ))}
    </div>
  );
}

function ClosingActions({
  canAdmin,
  canEdit,
  closing,
  disabled,
  itemCounts,
  onTransition,
}: {
  canAdmin: boolean;
  canEdit: boolean;
  closing: MonthlyClosing;
  disabled: boolean;
  itemCounts: Record<MonthlyClosingItemStatus, number>;
  onTransition: (target: MonthlyClosingStatus) => Promise<void>;
}) {
  if (closing.status === "abierto" && canEdit) {
    return (
      <button
        className="submit-button"
        disabled={disabled || itemCounts.pendiente > 0}
        onClick={() => void onTransition("revision")}
        type="button"
      >
        Enviar a revision
      </button>
    );
  }
  if (closing.status === "revision" && canAdmin) {
    return (
      <div className="closing-heading-actions">
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={() => void onTransition("abierto")}
          type="button"
        >
          Reabrir
        </button>
        <button
          className="submit-button"
          disabled={disabled || itemCounts.aprobado < 14}
          onClick={() => void onTransition("aprobado")}
          type="button"
        >
          Aprobar cierre
        </button>
      </div>
    );
  }
  if (closing.status === "aprobado" && canAdmin) {
    return (
      <div className="closing-heading-actions">
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={() => void onTransition("abierto")}
          type="button"
        >
          Reabrir
        </button>
        <button
          className="submit-button"
          disabled={disabled}
          onClick={() => void onTransition("cerrado")}
          type="button"
        >
          Finalizar periodo
        </button>
      </div>
    );
  }
  if (closing.status === "cerrado" && canAdmin) {
    return (
      <button
        className="secondary-button"
        disabled={disabled}
        onClick={() => void onTransition("abierto")}
        type="button"
      >
        Reabrir periodo
      </button>
    );
  }
  return null;
}

function ClosingConsolidated({
  money,
  obligationNotice,
  summary,
}: {
  money: (value: number) => string;
  obligationNotice: string;
  summary: ReturnType<typeof buildClosingSummary>;
}) {
  return (
    <div className="closing-consolidated">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Resultado por sector</p>
            <h3>Ingresos y gastos</h3>
          </div>
        </div>
        <div className="table-wrap closing-sector-table">
          <table>
            <thead>
              <tr>
                <th>Sector</th>
                <th>Ingresos</th>
                <th>Gastos</th>
                <th>Resultado</th>
                <th>Movimientos</th>
              </tr>
            </thead>
            <tbody>
              {summary.bySector.map((sector) => (
                <tr key={sector.label}>
                  <td>{sector.label}</td>
                  <td>{money(sector.income)}</td>
                  <td>{money(sector.expense)}</td>
                  <td className={sector.result < 0 ? "negative" : "positive"}>
                    {money(sector.result)}
                  </td>
                  <td>{sector.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="closing-consolidated-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tesoreria</p>
              <h3>Cajas del periodo</h3>
            </div>
          </div>
          <div className="closing-cash-list">
            {summary.byCashbox.map((cashbox) => (
              <article key={cashbox.label}>
                <div>
                  <strong>{cashbox.label}</strong>
                  <small>Movimiento neto del mes</small>
                </div>
                <strong
                  className={cashbox.net < 0 ? "negative" : "positive"}
                >
                  {money(cashbox.net)}
                </strong>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Obligaciones</p>
              <h3>Cuentas pendientes</h3>
            </div>
          </div>
          <div className="closing-obligation-grid">
            <div>
              <span>Por cobrar</span>
              <strong>{money(summary.receivables)}</strong>
            </div>
            <div>
              <span>Por pagar</span>
              <strong>{money(summary.payables)}</strong>
            </div>
          </div>
          {obligationNotice && (
            <p className="closing-inline-notice">{obligationNotice}</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Soporte operativo</p>
              <h3>Inventario y personal</h3>
            </div>
          </div>
          <div className="closing-support-list">
            <div>
              <span>Valor actual de inventario</span>
              <strong>{money(summary.inventoryValue)}</strong>
            </div>
            <div>
              <span>Articulos bajo minimo</span>
              <strong>{summary.lowStock}</strong>
            </div>
            <div>
              <span>Funcionarios activos</span>
              <strong>{summary.activeEmployees}</strong>
            </div>
            <div>
              <span>Salario base mensual</span>
              <strong>{money(summary.basePayroll)}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ClosingDocument({
  detail,
  ready,
  title,
}: {
  detail: string;
  ready: boolean;
  title: string;
}) {
  return (
    <article>
      <span aria-hidden="true">{ready ? "OK" : "--"}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <em className={ready ? "ready" : ""}>
        {ready ? "Disponible" : "Pendiente"}
      </em>
    </article>
  );
}

function buildClosingSummary({
  cashboxes,
  financeMovements,
  hrEmployees,
  inventoryItems,
  obligations,
  period,
  settlements,
}: {
  cashboxes: string[];
  financeMovements: FinanceMovement[];
  hrEmployees: HrEmployee[];
  inventoryItems: InventoryItem[];
  obligations: FinanceObligation[];
  period: string;
  settlements: FinanceObligationSettlement[];
}) {
  const periodMovements = financeMovements.filter((movement) =>
    movement.movementDate.startsWith(period),
  );
  const confirmed = periodMovements.filter(
    (movement) => movement.status === "confirmado",
  );
  const income = confirmed
    .filter((movement) => movement.movementType === "ingreso")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const expense = confirmed
    .filter((movement) => movement.movementType === "egreso")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const sectors = Array.from(
    new Set(confirmed.map((movement) => movement.linkedModule)),
  );
  const bySector = sectors
    .map((label) => {
      const sectorMovements = confirmed.filter(
        (movement) => movement.linkedModule === label,
      );
      const sectorIncome = sectorMovements
        .filter((movement) => movement.movementType === "ingreso")
        .reduce((sum, movement) => sum + movement.amount, 0);
      const sectorExpense = sectorMovements
        .filter((movement) => movement.movementType === "egreso")
        .reduce((sum, movement) => sum + movement.amount, 0);
      return {
        count: sectorMovements.length,
        expense: sectorExpense,
        income: sectorIncome,
        label,
        result: sectorIncome - sectorExpense,
      };
    })
    .sort((first, second) => second.income - first.income);
  const byCashbox = cashboxes.map((label) => {
    const movements = confirmed.filter(
      (movement) => movement.cashboxName === label,
    );
    return {
      label,
      net: movements.reduce(
        (sum, movement) =>
          sum +
          (movement.movementType === "egreso"
            ? -movement.amount
            : movement.movementType === "ingreso"
              ? movement.amount
              : 0),
        0,
      ),
    };
  });
  const settlementTotals = new Map<string, number>();
  for (const settlement of settlements) {
    if (settlement.status !== "confirmado") continue;
    settlementTotals.set(
      settlement.obligationId,
      (settlementTotals.get(settlement.obligationId) ?? 0) +
        settlement.amount,
    );
  }
  const obligationBalance = (type: "pagar" | "cobrar") =>
    obligations
      .filter(
        (obligation) =>
          obligation.type === type && obligation.status !== "anulado",
      )
      .reduce(
        (sum, obligation) =>
          sum +
          Math.max(
            0,
            obligation.amount -
              (settlementTotals.get(obligation.id) ?? 0),
          ),
        0,
      );
  const activeEmployees = hrEmployees.filter(
    (employee) => employee.status === "activo",
  );

  return {
    activeEmployees: activeEmployees.length,
    basePayroll: activeEmployees.reduce(
      (sum, employee) =>
        sum +
        (employee.salaryType === "mensual"
          ? employee.monthlySalary
          : 0),
      0,
    ),
    byCashbox,
    bySector,
    expense,
    income,
    inventoryItems: inventoryItems.length,
    inventoryValue: inventoryItems.reduce(
      (sum, item) => sum + item.currentStock * item.unitCost,
      0,
    ),
    lowStock: inventoryItems.filter(
      (item) => item.currentStock <= item.minStock,
    ).length,
    payables: obligationBalance("pagar"),
    period,
    receivables: obligationBalance("cobrar"),
    result: income - expense,
    unconfirmedMovements: periodMovements.filter(
      (movement) =>
        movement.status === "borrador" ||
        movement.status === "pendiente",
    ).length,
  };
}

function snapshotSummary(
  snapshot: Record<string, unknown>,
  fallback: ReturnType<typeof buildClosingSummary>,
) {
  return {
    ...fallback,
    activeEmployees: numeric(snapshot.activeEmployees, fallback.activeEmployees),
    basePayroll: numeric(snapshot.basePayroll, fallback.basePayroll),
    byCashbox: Array.isArray(snapshot.byCashbox)
      ? (snapshot.byCashbox as typeof fallback.byCashbox)
      : fallback.byCashbox,
    bySector: Array.isArray(snapshot.bySector)
      ? (snapshot.bySector as typeof fallback.bySector)
      : fallback.bySector,
    expense: numeric(snapshot.expense, fallback.expense),
    income: numeric(snapshot.income, fallback.income),
    inventoryItems: numeric(snapshot.inventoryItems, fallback.inventoryItems),
    inventoryValue: numeric(
      snapshot.inventoryValue,
      fallback.inventoryValue,
    ),
    lowStock: numeric(snapshot.lowStock, fallback.lowStock),
    payables: numeric(snapshot.payables, fallback.payables),
    receivables: numeric(snapshot.receivables, fallback.receivables),
    result: numeric(snapshot.result, fallback.result),
    unconfirmedMovements: numeric(
      snapshot.unconfirmedMovements,
      fallback.unconfirmedMovements,
    ),
  };
}

function integrationState(
  key: string,
  summary: ReturnType<typeof buildClosingSummary>,
) {
  if (
    [
      "resumen_general",
      "ingresos_ventas_sector",
      "gastos_sector",
      "caja_bancos",
      "cuentas_cobrar",
      "cuentas_pagar",
      "indicadores_mensuales",
    ].includes(key)
  ) {
    return {
      label:
        summary.income || summary.expense || summary.payables || summary.receivables
          ? "Conectado"
          : "Sin datos",
      tone: "connected",
    };
  }
  if (key === "inventario") {
    return {
      label: summary.inventoryItems ? "Parcial" : "Sin datos",
      tone: "partial",
    };
  }
  if (key === "personal_salarios") {
    return {
      label: summary.activeEmployees ? "Parcial" : "Sin datos",
      tone: "partial",
    };
  }
  return { label: "Modulo pendiente", tone: "pending" };
}

function itemWeight(status: MonthlyClosingItemStatus) {
  if (status === "preparado") return 0.5;
  if (status === "revisado") return 0.75;
  if (status === "aprobado") return 1;
  return 0;
}

function itemStatusLabel(status: MonthlyClosingItemStatus) {
  return {
    aprobado: "Aprobado",
    pendiente: "Pendiente",
    preparado: "Preparado",
    revisado: "Revisado",
  }[status];
}

function closingStatusLabel(status: MonthlyClosingStatus) {
  return {
    abierto: "Abierto",
    aprobado: "Aprobado",
    cerrado: "Cerrado",
    revision: "En revision",
  }[status];
}

function transitionConfirmation(status: MonthlyClosingStatus) {
  if (status === "cerrado") {
    return "Desea finalizar el periodo y guardar la fotografia del cierre?";
  }
  if (status === "abierto") {
    return "Desea reabrir el periodo? La accion quedara registrada.";
  }
  return "";
}

function reportNumber(reportKey: string) {
  return (
    closingReportDefinitions.find((report) => report.key === reportKey)
      ?.number ?? "-"
  );
}

function periodLabel(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  return new Intl.DateTimeFormat("es-PY", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${period}-15T12:00:00`));
}

function dateTimeLabel(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function localDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numeric(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo actualizar el cierre.";
}

async function requestClosing(period: string): Promise<ClosingPayload> {
  const response = await fetch(
    `/api/closings?period=${encodeURIComponent(period)}`,
    { cache: "no-store" },
  );
  const payload = (await response.json()) as ClosingPayload;
  if (!response.ok) {
    throw new Error(payload.error ?? "No se pudo cargar el cierre.");
  }
  return payload;
}

async function requestObligations() {
  const response = await fetch("/api/finance/obligations", {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    error?: string;
    obligations?: FinanceObligation[];
    settlements?: FinanceObligationSettlement[];
  };
  if (!response.ok || !payload.obligations || !payload.settlements) {
    throw new Error(payload.error ?? "No se pudieron cargar las obligaciones.");
  }
  return {
    obligations: payload.obligations,
    settlements: payload.settlements,
  };
}
