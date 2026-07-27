"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  linkedModules,
  paymentMethods,
  type LinkedModule,
} from "@/lib/company-data";
import type {
  FinanceObligation,
  FinanceObligationSettlement,
  FinanceObligationType,
} from "@/lib/finance-obligations";

type ObligationForm = {
  accountName: string;
  amount: string;
  concept: string;
  costCenterName: string;
  documentNumber: string;
  dueDate: string;
  issueDate: string;
  linkedModule: LinkedModule;
  notes: string;
  partyName: string;
};

type SettlementForm = {
  amount: string;
  cashboxName: string;
  date: string;
  method: string;
  notes: string;
  reference: string;
};

type StatusFilter =
  | "Todos"
  | "Pendiente"
  | "Parcial"
  | "Vencido"
  | "Saldado"
  | "Anulado";

type ObligationsPayload = {
  obligations: FinanceObligation[];
  settlements: FinanceObligationSettlement[];
};

const today = new Date().toISOString().slice(0, 10);

function emptyObligationForm(): ObligationForm {
  return {
    accountName: "",
    amount: "",
    concept: "",
    costCenterName: "",
    documentNumber: "",
    dueDate: today,
    issueDate: today,
    linkedModule: "General",
    notes: "",
    partyName: "",
  };
}

function emptySettlementForm(cashboxes: string[]): SettlementForm {
  return {
    amount: "",
    cashboxName: cashboxes[0] ?? "",
    date: today,
    method: paymentMethods[0] ?? "",
    notes: "",
    reference: "",
  };
}

export function FinanceObligationsPanel({
  canAdmin,
  canEdit,
  cashboxes,
  costCenters,
  financeAccounts,
  money,
  onMovementsRefresh,
  type,
}: {
  canAdmin: boolean;
  canEdit: boolean;
  cashboxes: string[];
  costCenters: string[];
  financeAccounts: string[];
  money: (value: number) => string;
  onMovementsRefresh: () => Promise<void>;
  type: FinanceObligationType;
}) {
  const [obligations, setObligations] = useState<FinanceObligation[]>([]);
  const [settlements, setSettlements] = useState<
    FinanceObligationSettlement[]
  >([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todos");
  const [dueMonth, setDueMonth] = useState("");
  const [form, setForm] = useState<ObligationForm>(emptyObligationForm);
  const [settlementForm, setSettlementForm] = useState<SettlementForm>(() =>
    emptySettlementForm(cashboxes),
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] =
    useState<FinanceObligation | null>(null);
  const [settlementTarget, setSettlementTarget] =
    useState<FinanceObligation | null>(null);
  const [detailTarget, setDetailTarget] =
    useState<FinanceObligation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshData = useCallback(async () => {
    const payload = await requestObligations();
    setObligations(payload.obligations);
    setSettlements(payload.settlements);
  }, []);

  useEffect(() => {
    let active = true;
    void requestObligations()
      .then((payload) => {
        if (!active) return;
        setObligations(payload.obligations);
        setSettlements(payload.settlements);
        setError("");
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar las cuentas pendientes.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshData]);

  const settlementsByObligation = useMemo(() => {
    const grouped = new Map<string, FinanceObligationSettlement[]>();
    for (const settlement of settlements) {
      grouped.set(settlement.obligationId, [
        ...(grouped.get(settlement.obligationId) ?? []),
        settlement,
      ]);
    }
    return grouped;
  }, [settlements]);

  const typedObligations = useMemo(
    () => obligations.filter((obligation) => obligation.type === type),
    [obligations, type],
  );
  const filteredObligations = useMemo(() => {
    const normalizedQuery = normalize(query);
    return typedObligations.filter((obligation) => {
      const summary = obligationSummary(
        obligation,
        settlementsByObligation.get(obligation.id) ?? [],
      );
      return (
        (!dueMonth || obligation.dueDate.startsWith(dueMonth)) &&
        (statusFilter === "Todos" || summary.label === statusFilter) &&
        (!normalizedQuery ||
          normalize(
            [
              obligation.partyName,
              obligation.concept,
              obligation.documentNumber,
              obligation.linkedModule,
              obligation.accountName,
              obligation.costCenterName,
            ].join(" "),
          ).includes(normalizedQuery))
      );
    });
  }, [
    dueMonth,
    query,
    settlementsByObligation,
    statusFilter,
    typedObligations,
  ]);

  const totals = useMemo(() => {
    const summaries = typedObligations.map((obligation) =>
      obligationSummary(
        obligation,
        settlementsByObligation.get(obligation.id) ?? [],
      ),
    );
    const inSevenDays = addDays(today, 7);
    const currentMonth = today.slice(0, 7);
    return {
      dueSoon: summaries
        .filter(
          (summary) =>
            summary.balance > 0 &&
            summary.status !== "anulado" &&
            summary.dueDate >= today &&
            summary.dueDate <= inSevenDays,
        )
        .reduce((sum, summary) => sum + summary.balance, 0),
      overdue: summaries
        .filter((summary) => summary.label === "Vencido")
        .reduce((sum, summary) => sum + summary.balance, 0),
      pending: summaries
        .filter(
          (summary) =>
            summary.balance > 0 && summary.status !== "anulado",
        )
        .reduce((sum, summary) => sum + summary.balance, 0),
      settledMonth: settlements
        .filter(
          (settlement) =>
            settlement.status === "confirmado" &&
            settlement.date.startsWith(currentMonth) &&
            typedObligations.some(
              (obligation) => obligation.id === settlement.obligationId,
            ),
        )
        .reduce((sum, settlement) => sum + settlement.amount, 0),
    };
  }, [settlements, settlementsByObligation, typedObligations]);

  const terminology =
    type === "pagar"
      ? {
          action: "Registrar pago",
          completed: "Pagado este mes",
          counterparty: "Proveedor",
          eyebrow: "Proveedores",
          title: "Cuentas por pagar",
        }
      : {
          action: "Registrar cobro",
          completed: "Cobrado este mes",
          counterparty: "Cliente",
          eyebrow: "Clientes",
          title: "Cuentas por cobrar",
        };

  function openNewAccount() {
    setForm(emptyObligationForm());
    setEditingTarget(null);
    setError("");
    setMessage("");
    setFormOpen(true);
  }

  function openEditAccount(obligation: FinanceObligation) {
    setForm({
      accountName: obligation.accountName,
      amount: String(obligation.amount),
      concept: obligation.concept,
      costCenterName: obligation.costCenterName,
      documentNumber: obligation.documentNumber,
      dueDate: obligation.dueDate,
      issueDate: obligation.issueDate,
      linkedModule: obligation.linkedModule,
      notes: obligation.notes,
      partyName: obligation.partyName,
    });
    setEditingTarget(obligation);
    setError("");
    setMessage("");
    setFormOpen(true);
  }

  function closeAccountForm() {
    setFormOpen(false);
    setEditingTarget(null);
  }

  function openSettlement(obligation: FinanceObligation) {
    const summary = obligationSummary(
      obligation,
      settlementsByObligation.get(obligation.id) ?? [],
    );
    setSettlementForm({
      ...emptySettlementForm(cashboxes),
      amount: String(summary.balance),
      reference: obligation.documentNumber,
    });
    setError("");
    setMessage("");
    setSettlementTarget(obligation);
  }

  async function submitObligation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/finance/obligations", {
        body: JSON.stringify({
          ...form,
          action: editingTarget ? "update" : undefined,
          amount: Number(form.amount),
          id: editingTarget?.id,
          type,
        }),
        headers: { "Content-Type": "application/json" },
        method: editingTarget ? "PATCH" : "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo guardar la cuenta.");
      }
      await refreshData();
      closeAccountForm();
      setMessage(
        editingTarget
          ? "Cuenta actualizada."
          : type === "pagar"
            ? "Cuenta por pagar registrada."
            : "Cuenta por cobrar registrada.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la cuenta.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settlementTarget) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/finance/obligations", {
        body: JSON.stringify({
          ...settlementForm,
          action: "settle",
          amount: Number(settlementForm.amount),
          id: settlementTarget.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ??
            (type === "pagar"
              ? "No se pudo registrar el pago."
              : "No se pudo registrar el cobro."),
        );
      }
      await Promise.all([refreshData(), onMovementsRefresh()]);
      setSettlementTarget(null);
      setMessage(
        type === "pagar" ? "Pago registrado en caja." : "Cobro registrado en caja.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo registrar la operacion.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    obligation: FinanceObligation,
    action: "cancel" | "reopen",
  ) {
    const actionLabel = action === "cancel" ? "anular" : "reactivar";
    if (
      !window.confirm(
        `Desea ${actionLabel} la cuenta de ${obligation.partyName}?`,
      )
    ) {
      return;
    }
    setDetailTarget(null);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/finance/obligations", {
        body: JSON.stringify({ action, id: obligation.id }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo actualizar la cuenta.");
      }
      await refreshData();
      setMessage(
        action === "cancel" ? "Cuenta anulada." : "Cuenta reactivada.",
      );
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "No se pudo actualizar la cuenta.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function voidSettlement(settlement: FinanceObligationSettlement) {
    if (
      !window.confirm(
        `Desea anular esta aplicacion de ${money(settlement.amount)}?`,
      )
    ) {
      return;
    }
    setDetailTarget(null);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/finance/obligations", {
        body: JSON.stringify({
          action: "void_settlement",
          id: settlement.obligationId,
          settlementId: settlement.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "No se pudo anular el pago o cobro.",
        );
      }
      await Promise.all([refreshData(), onMovementsRefresh()]);
      setMessage(
        type === "pagar"
          ? "Pago anulado y caja actualizada."
          : "Cobro anulado y caja actualizada.",
      );
    } catch (voidError) {
      setError(
        voidError instanceof Error
          ? voidError.message
          : "No se pudo anular el pago o cobro.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel finance-obligations-panel">
      <div className="panel-heading finance-obligations-heading">
        <div>
          <p className="eyebrow">{terminology.eyebrow}</p>
          <h3>{terminology.title}</h3>
        </div>
        {canEdit && (
          <button
            className="submit-button"
            onClick={openNewAccount}
            type="button"
          >
            Nueva cuenta
          </button>
        )}
      </div>

      {message && <div className="status-banner success">{message}</div>}
      {error && !formOpen && !settlementTarget && (
        <div className="status-banner danger">{error}</div>
      )}
      {!canEdit && (
        <div className="status-banner locked">
          Permiso lector: puede consultar cuentas y vencimientos.
        </div>
      )}

      <div className="finance-obligation-kpis">
        <ObligationKpi label="Saldo pendiente" value={money(totals.pending)} />
        <ObligationKpi
          label="Saldo vencido"
          tone="danger"
          value={money(totals.overdue)}
        />
        <ObligationKpi
          label="Vence en 7 dias"
          tone="warning"
          value={money(totals.dueSoon)}
        />
        <ObligationKpi
          label={terminology.completed}
          value={money(totals.settledMonth)}
        />
      </div>

      <div className="finance-obligation-filters">
        <label>
          Buscar
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${terminology.counterparty}, concepto o comprobante`}
            value={query}
          />
        </label>
        <label>
          Vencimiento
          <input
            onChange={(event) => setDueMonth(event.target.value)}
            type="month"
            value={dueMonth}
          />
        </label>
        <label>
          Estado
          <select
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            value={statusFilter}
          >
            <option>Todos</option>
            <option>Pendiente</option>
            <option>Parcial</option>
            <option>Vencido</option>
            <option>Saldado</option>
            <option>Anulado</option>
          </select>
        </label>
        <button
          className="secondary-button"
          onClick={() => {
            setQuery("");
            setDueMonth("");
            setStatusFilter("Todos");
          }}
          type="button"
        >
          Limpiar
        </button>
      </div>

      <div className="table-wrap finance-obligation-table">
        <table>
          <thead>
            <tr>
              <th>Vencimiento</th>
              <th>{terminology.counterparty}</th>
              <th>Concepto</th>
              <th>Clasificacion</th>
              <th>Total</th>
              <th>Aplicado</th>
              <th>Saldo</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="finance-obligation-empty" colSpan={9}>
                  Cargando cuentas...
                </td>
              </tr>
            ) : filteredObligations.length ? (
              filteredObligations.map((obligation) => {
                const obligationSettlements =
                  settlementsByObligation.get(obligation.id) ?? [];
                const summary = obligationSummary(
                  obligation,
                  obligationSettlements,
                );
                return (
                  <tr key={obligation.id}>
                    <td>
                      <strong>{formatDate(obligation.dueDate)}</strong>
                      <small>{daysLabel(obligation.dueDate, summary.balance)}</small>
                    </td>
                    <td>
                      <strong>{obligation.partyName}</strong>
                      <small>{obligation.documentNumber || "Sin comprobante"}</small>
                    </td>
                    <td>
                      <strong>{obligation.concept}</strong>
                      <small>{obligation.linkedModule}</small>
                    </td>
                    <td>
                      <strong>{obligation.accountName}</strong>
                      <small>{obligation.costCenterName}</small>
                    </td>
                    <td>{money(obligation.amount)}</td>
                    <td>{money(summary.paid)}</td>
                    <td>
                      <strong>{money(summary.balance)}</strong>
                    </td>
                    <td>
                      <span
                        className={`finance-obligation-status ${summary.tone}`}
                      >
                        {summary.label}
                      </span>
                    </td>
                    <td>
                      <div className="finance-obligation-actions">
                        <button
                          onClick={() => setDetailTarget(obligation)}
                          type="button"
                        >
                          Ver
                        </button>
                        {canEdit &&
                          summary.status === "pendiente" &&
                          summary.paid === 0 && (
                            <button
                              onClick={() => openEditAccount(obligation)}
                              type="button"
                            >
                              Editar
                            </button>
                          )}
                        {canAdmin &&
                          summary.balance > 0 &&
                          summary.status !== "anulado" && (
                            <button
                              className="primary"
                              onClick={() => openSettlement(obligation)}
                              type="button"
                            >
                              {type === "pagar" ? "Pagar" : "Cobrar"}
                            </button>
                          )}
                        {canAdmin &&
                          summary.status === "pendiente" &&
                          summary.paid === 0 && (
                            <button
                              className="danger"
                              disabled={saving}
                              onClick={() =>
                                void changeStatus(obligation, "cancel")
                              }
                              type="button"
                            >
                              Anular
                            </button>
                          )}
                        {canAdmin && summary.status === "anulado" && (
                          <button
                            disabled={saving}
                            onClick={() =>
                              void changeStatus(obligation, "reopen")
                            }
                            type="button"
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="finance-obligation-empty" colSpan={9}>
                  No hay cuentas para los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className="hr-modal-backdrop" role="presentation">
          <section
            aria-labelledby="finance-obligation-form-title"
            aria-modal="true"
            className="hr-modal finance-obligation-modal"
            role="dialog"
          >
            <div className="hr-modal-heading">
              <div>
                <p className="eyebrow">{terminology.eyebrow}</p>
                <h3 id="finance-obligation-form-title">
                  {editingTarget ? "Editar cuenta" : "Nueva cuenta"}
                </h3>
              </div>
              <button
                aria-label="Cerrar"
                className="hr-close-button"
                onClick={closeAccountForm}
                type="button"
              >
                X
              </button>
            </div>
            <form className="hr-employee-form" onSubmit={submitObligation}>
              {error && <div className="status-banner danger">{error}</div>}
              <fieldset disabled={saving}>
                <div className="hr-form-grid">
                  <label>
                    {terminology.counterparty}
                    <input
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          partyName: event.target.value,
                        }))
                      }
                      required
                      value={form.partyName}
                    />
                  </label>
                  <label>
                    Comprobante
                    <input
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          documentNumber: event.target.value,
                        }))
                      }
                      value={form.documentNumber}
                    />
                  </label>
                  <label className="hr-span-2">
                    Concepto
                    <input
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          concept: event.target.value,
                        }))
                      }
                      required
                      value={form.concept}
                    />
                  </label>
                  <label>
                    Fecha de emision
                    <input
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          issueDate: event.target.value,
                        }))
                      }
                      required
                      type="date"
                      value={form.issueDate}
                    />
                  </label>
                  <label>
                    Vencimiento
                    <input
                      min={form.issueDate}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          dueDate: event.target.value,
                        }))
                      }
                      required
                      type="date"
                      value={form.dueDate}
                    />
                  </label>
                  <label>
                    Monto
                    <input
                      min="1"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      required
                      step="1"
                      type="number"
                      value={form.amount}
                    />
                  </label>
                  <label>
                    Modulo
                    <select
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          linkedModule: event.target.value as LinkedModule,
                        }))
                      }
                      value={form.linkedModule}
                    >
                      {linkedModules.map((module) => (
                        <option key={module} value={module}>
                          {module}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cuenta contable
                    <select
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          accountName: event.target.value,
                        }))
                      }
                      required
                      value={form.accountName}
                    >
                      <option value="">Seleccionar</option>
                      {financeAccounts.map((account) => (
                        <option key={account} value={account}>
                          {account}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Centro de costo
                    <select
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          costCenterName: event.target.value,
                        }))
                      }
                      required
                      value={form.costCenterName}
                    >
                      <option value="">Seleccionar</option>
                      {costCenters.map((center) => (
                        <option key={center} value={center}>
                          {center}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hr-span-2">
                    Observaciones
                    <textarea
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      value={form.notes}
                    />
                  </label>
                </div>
                <div className="hr-modal-actions">
                  <button
                    className="secondary-button"
                    onClick={closeAccountForm}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button className="submit-button" type="submit">
                    {saving
                      ? "Guardando..."
                      : editingTarget
                        ? "Actualizar cuenta"
                        : "Guardar cuenta"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}

      {settlementTarget && (
        <div className="hr-modal-backdrop" role="presentation">
          <section
            aria-labelledby="finance-settlement-title"
            aria-modal="true"
            className="hr-modal finance-settlement-modal"
            role="dialog"
          >
            <div className="hr-modal-heading">
              <div>
                <p className="eyebrow">{terminology.counterparty}</p>
                <h3 id="finance-settlement-title">{terminology.action}</h3>
              </div>
              <button
                aria-label="Cerrar"
                className="hr-close-button"
                onClick={() => setSettlementTarget(null)}
                type="button"
              >
                X
              </button>
            </div>
            <form className="hr-employee-form" onSubmit={submitSettlement}>
              {error && <div className="status-banner danger">{error}</div>}
              <div className="finance-settlement-account">
                <div>
                  <span>{terminology.counterparty}</span>
                  <strong>{settlementTarget.partyName}</strong>
                </div>
                <div>
                  <span>Saldo pendiente</span>
                  <strong>
                    {money(
                      obligationSummary(
                        settlementTarget,
                        settlementsByObligation.get(settlementTarget.id) ?? [],
                      ).balance,
                    )}
                  </strong>
                </div>
              </div>
              <fieldset disabled={saving}>
                <div className="hr-form-grid">
                  <label>
                    Fecha
                    <input
                      onChange={(event) =>
                        setSettlementForm((current) => ({
                          ...current,
                          date: event.target.value,
                        }))
                      }
                      required
                      type="date"
                      value={settlementForm.date}
                    />
                  </label>
                  <label>
                    Importe
                    <input
                      max={obligationSummary(
                        settlementTarget,
                        settlementsByObligation.get(settlementTarget.id) ?? [],
                      ).balance}
                      min="1"
                      onChange={(event) =>
                        setSettlementForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      required
                      step="1"
                      type="number"
                      value={settlementForm.amount}
                    />
                  </label>
                  <label>
                    Caja
                    <select
                      onChange={(event) =>
                        setSettlementForm((current) => ({
                          ...current,
                          cashboxName: event.target.value,
                        }))
                      }
                      required
                      value={settlementForm.cashboxName}
                    >
                      {cashboxes.map((cashbox) => (
                        <option key={cashbox} value={cashbox}>
                          {cashbox}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Medio
                    <select
                      onChange={(event) =>
                        setSettlementForm((current) => ({
                          ...current,
                          method: event.target.value,
                        }))
                      }
                      required
                      value={settlementForm.method}
                    >
                      {paymentMethods.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hr-span-2">
                    Referencia
                    <input
                      onChange={(event) =>
                        setSettlementForm((current) => ({
                          ...current,
                          reference: event.target.value,
                        }))
                      }
                      value={settlementForm.reference}
                    />
                  </label>
                  <label className="hr-span-2">
                    Observaciones
                    <textarea
                      onChange={(event) =>
                        setSettlementForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      value={settlementForm.notes}
                    />
                  </label>
                </div>
                <div className="hr-modal-actions">
                  <button
                    className="secondary-button"
                    onClick={() => setSettlementTarget(null)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button className="submit-button" type="submit">
                    {saving ? "Guardando..." : terminology.action}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}

      {detailTarget && (
        <ObligationDetail
          canAdmin={canAdmin}
          money={money}
          obligation={detailTarget}
          onClose={() => setDetailTarget(null)}
          onVoidSettlement={voidSettlement}
          saving={saving}
          settlements={settlementsByObligation.get(detailTarget.id) ?? []}
          terminology={terminology}
        />
      )}
    </section>
  );
}

function ObligationKpi({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "danger" | "warning";
  value: string;
}) {
  return (
    <article className={tone ?? ""}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ObligationDetail({
  canAdmin,
  money,
  obligation,
  onClose,
  onVoidSettlement,
  saving,
  settlements,
  terminology,
}: {
  canAdmin: boolean;
  money: (value: number) => string;
  obligation: FinanceObligation;
  onClose: () => void;
  onVoidSettlement: (
    settlement: FinanceObligationSettlement,
  ) => Promise<void>;
  saving: boolean;
  settlements: FinanceObligationSettlement[];
  terminology: {
    action: string;
    completed: string;
    counterparty: string;
    eyebrow: string;
    title: string;
  };
}) {
  const summary = obligationSummary(obligation, settlements);
  return (
    <div className="hr-modal-backdrop" role="presentation">
      <section
        aria-labelledby="finance-obligation-detail-title"
        aria-modal="true"
        className="hr-modal finance-obligation-detail-modal"
        role="dialog"
      >
        <div className="hr-modal-heading">
          <div>
            <p className="eyebrow">{terminology.counterparty}</p>
            <h3 id="finance-obligation-detail-title">
              {obligation.partyName}
            </h3>
          </div>
          <button
            aria-label="Cerrar"
            className="hr-close-button"
            onClick={onClose}
            type="button"
          >
            X
          </button>
        </div>
        <div className="finance-obligation-detail">
          <div className="finance-obligation-detail-grid">
            <div>
              <span>Concepto</span>
              <strong>{obligation.concept}</strong>
            </div>
            <div>
              <span>Comprobante</span>
              <strong>{obligation.documentNumber || "-"}</strong>
            </div>
            <div>
              <span>Emision</span>
              <strong>{formatDate(obligation.issueDate)}</strong>
            </div>
            <div>
              <span>Vencimiento</span>
              <strong>{formatDate(obligation.dueDate)}</strong>
            </div>
            <div>
              <span>Monto original</span>
              <strong>{money(obligation.amount)}</strong>
            </div>
            <div>
              <span>Saldo pendiente</span>
              <strong>{money(summary.balance)}</strong>
            </div>
          </div>
          <h4>Historial de aplicaciones</h4>
          <div className="table-wrap finance-settlement-history">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Caja</th>
                  <th>Medio</th>
                  <th>Referencia</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length ? (
                  settlements.map((settlement) => (
                    <tr key={settlement.id}>
                      <td>{formatDate(settlement.date)}</td>
                      <td>{settlement.cashboxName}</td>
                      <td>{settlement.method}</td>
                      <td>{settlement.reference || "-"}</td>
                      <td>{money(settlement.amount)}</td>
                      <td>
                        <span
                          className={`finance-obligation-status ${
                            settlement.status === "confirmado"
                              ? "paid"
                              : "cancelled"
                          }`}
                        >
                          {settlement.status === "confirmado"
                            ? "Aplicado"
                            : "Anulado"}
                        </span>
                      </td>
                      <td>
                        {canAdmin && settlement.status === "confirmado" ? (
                          <button
                            className="finance-settlement-void"
                            disabled={saving}
                            onClick={() => void onVoidSettlement(settlement)}
                            type="button"
                          >
                            Anular
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="finance-obligation-empty" colSpan={7}>
                      Todavia no hay aplicaciones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function obligationSummary(
  obligation: FinanceObligation,
  settlements: FinanceObligationSettlement[],
) {
  const paid = settlements
    .filter((settlement) => settlement.status === "confirmado")
    .reduce((sum, settlement) => sum + settlement.amount, 0);
  const balance = Math.max(0, obligation.amount - paid);
  if (obligation.status === "anulado") {
    return {
      balance,
      dueDate: obligation.dueDate,
      label: "Anulado" as const,
      paid,
      status: obligation.status,
      tone: "cancelled",
    };
  }
  if (balance <= 0 || obligation.status === "pagado") {
    return {
      balance: 0,
      dueDate: obligation.dueDate,
      label: "Saldado" as const,
      paid,
      status: "pagado" as const,
      tone: "paid",
    };
  }
  if (obligation.dueDate < today) {
    return {
      balance,
      dueDate: obligation.dueDate,
      label: "Vencido" as const,
      paid,
      status: obligation.status,
      tone: "overdue",
    };
  }
  if (paid > 0 || obligation.status === "parcial") {
    return {
      balance,
      dueDate: obligation.dueDate,
      label: "Parcial" as const,
      paid,
      status: "parcial" as const,
      tone: "partial",
    };
  }
  return {
    balance,
    dueDate: obligation.dueDate,
    label: "Pendiente" as const,
    paid,
    status: "pendiente" as const,
    tone: "pending",
  };
}

function daysLabel(dueDate: string, balance: number) {
  if (balance <= 0) return "Cerrado";
  const difference = Math.round(
    (new Date(`${dueDate}T12:00:00`).getTime() -
      new Date(`${today}T12:00:00`).getTime()) /
      86_400_000,
  );
  if (difference < 0) return `${Math.abs(difference)} dias vencido`;
  if (difference === 0) return "Vence hoy";
  return `Faltan ${difference} dias`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function requestObligations(): Promise<ObligationsPayload> {
  const response = await fetch("/api/finance/obligations", {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    error?: string;
    obligations?: FinanceObligation[];
    settlements?: FinanceObligationSettlement[];
  };
  if (!response.ok || !payload.obligations || !payload.settlements) {
    throw new Error(
      payload.error ?? "No se pudieron cargar las cuentas pendientes.",
    );
  }
  return {
    obligations: payload.obligations,
    settlements: payload.settlements,
  };
}
