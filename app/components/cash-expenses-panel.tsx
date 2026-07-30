"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CashExpenseAllocation,
  CashExpenseDocument,
  CashExpenseImportBatch,
  CashExpenseStatus,
  ImportedCommerceRecord,
} from "@/lib/cash-expenses";
import {
  linkedModules,
  type LinkedModule,
} from "@/lib/company-data";

type CashExpenseView = "comprobantes" | "conciliacion" | "importaciones";

type CashExpenseBundle = {
  accounts: string[];
  batches: CashExpenseImportBatch[];
  cashboxBalances: Record<string, number>;
  cashboxes: string[];
  commerceRecords: ImportedCommerceRecord[];
  costCenters: string[];
  documents: CashExpenseDocument[];
  storageMode: "demo" | "supabase";
};

type DraftAllocation = {
  accountName: string;
  amount: string;
  costObjectName: string;
  costCenterName: string;
  detail: string;
  linkedModule: LinkedModule;
  sourceCategory: string;
  sourceSubcategory: string;
};

type AllocationUpdate = {
  accountName: string;
  amount: number;
  costObjectName: string;
  costCenterName: string;
  detail: string;
  linkedModule: LinkedModule;
};

type ExpenseDraft = {
  cashboxName: string;
  description: string;
  documentDate: string;
  documentNumber: string;
  notes: string;
  paymentMethod: string;
  responsible: string;
  supplier: string;
};

type ImportPreview = {
  allocationCount: number;
  commerceCount: number;
  duplicateDocumentGroups: number;
  expenseCount: number;
  fileName: string;
  missingDocumentCount: number;
  missingResponsibleCount: number;
  payload: Record<string, unknown>;
  totalAmount: number;
};

const emptyBundle: CashExpenseBundle = {
  accounts: [],
  batches: [],
  cashboxBalances: {},
  cashboxes: [],
  commerceRecords: [],
  costCenters: [],
  documents: [],
  storageMode: "demo",
};

const today = new Date().toISOString().slice(0, 10);

export function CashExpensesPanel({
  canAdmin,
  canEdit,
  fallbackAccounts,
  fallbackCashboxes,
  fallbackCostCenters,
  money,
  onFinanceChanged,
  period,
  setPeriod,
}: {
  canAdmin: boolean;
  canEdit: boolean;
  fallbackAccounts: string[];
  fallbackCashboxes: string[];
  fallbackCostCenters: string[];
  money: (value: number) => string;
  onFinanceChanged: () => Promise<void>;
  period: string;
  setPeriod: (period: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeView, setActiveView] =
    useState<CashExpenseView>("comprobantes");
  const [bundle, setBundle] = useState<CashExpenseBundle>(emptyBundle);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [showEntry, setShowEntry] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"todos" | CashExpenseStatus>(
    "todos",
  );

  const loadData = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/finance/cash-expenses?period=${encodeURIComponent(period)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as CashExpenseBundle & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudieron cargar los gastos.");
      }
      setBundle(payload);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los gastos.",
      );
    }
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/finance/cash-expenses?period=${encodeURIComponent(period)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const payload = (await response.json()) as CashExpenseBundle & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(
            payload.error ?? "No se pudieron cargar los gastos.",
          );
        }
        return payload;
      })
      .then((payload) => {
        if (!cancelled) {
          setBundle(payload);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudieron cargar los gastos.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const accounts = mergeCatalogs(bundle.accounts, fallbackAccounts);
  const cashboxes = [...fallbackCashboxes];
  const costCenters = mergeCatalogs(
    bundle.costCenters,
    fallbackCostCenters,
  );
  const summary = useMemo(
    () => buildExpenseSummary(bundle.documents),
    [bundle.documents],
  );
  const visibleDocuments = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es");
    return bundle.documents.filter((document) => {
      if (statusFilter !== "todos" && document.status !== statusFilter) {
        return false;
      }
      if (!normalized) return true;
      return [
        document.documentNumber,
        document.supplier,
        document.responsible,
        document.description,
        document.cashboxName,
        ...document.allocations.flatMap((allocation) => [
          allocation.sourceCategory,
          allocation.sourceSubcategory,
          allocation.detail,
        ]),
      ].some((value) =>
        value.toLocaleLowerCase("es").includes(normalized),
      );
    });
  }, [bundle.documents, search, statusFilter]);

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");

    if (!file.name.toLocaleLowerCase("es").endsWith(".json")) {
      setError("Seleccione un archivo JSON.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("El archivo supera el limite de 8 MB.");
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as Record<string, unknown>;
      const preview = inspectLegacyPayload(payload, file.name);
      setImportPreview(preview);
    } catch (fileError) {
      setError(
        fileError instanceof Error
          ? fileError.message
          : "No se pudo leer el respaldo.",
      );
    }
  }

  async function importBackup() {
    if (!importPreview || !canAdmin) return;
    setBusy("import");
    setError("");
    try {
      const response = await fetch("/api/finance/cash-expenses", {
        body: JSON.stringify({
          action: "import",
          fileName: importPreview.fileName,
          payload: importPreview.payload,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        batch?: CashExpenseImportBatch;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo importar el respaldo.");
      }
      setImportPreview(null);
      setNotice(
        `${payload.batch?.expenseCount ?? importPreview.expenseCount} comprobantes importados como pendientes de revision.`,
      );
      setActiveView("comprobantes");
      await loadData();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "No se pudo importar el respaldo.",
      );
    } finally {
      setBusy("");
    }
  }

  async function transitionDocument(
    documentId: string,
    status: "confirmado" | "anulado" | "pendiente",
  ) {
    if (
      status === "pendiente" &&
      !window.confirm(
        "¿Desea reabrir este comprobante para corregirlo? Debera revisar la caja y confirmarlo nuevamente.",
      )
    ) {
      return;
    }

    await patchDocument(
      documentId,
      status === "pendiente"
        ? { action: "reopen", documentId }
        : { action: "transition", documentId, status },
      status === "confirmado"
        ? "Comprobante confirmado y movimientos financieros generados."
        : status === "pendiente"
          ? "Comprobante reabierto. Revise la caja antes de confirmarlo."
          : "Comprobante anulado.",
      status !== "anulado",
    );
  }

  async function patchDocument(
    documentId: string,
    body: Record<string, unknown>,
    successMessage: string,
    refreshFinance = false,
  ) {
    setBusy(documentId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/finance/cash-expenses", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo actualizar.");
      }
      setNotice(successMessage);
      await loadData();
      if (refreshFinance) await onFinanceChanged();
    } catch (patchError) {
      setError(
        patchError instanceof Error
          ? patchError.message
          : "No se pudo actualizar.",
      );
    } finally {
      setBusy("");
    }
  }

  async function updateAllocation(
    allocation: CashExpenseAllocation,
    update: AllocationUpdate,
  ) {
    setBusy(allocation.id);
    setError("");
    try {
      const response = await fetch("/api/finance/cash-expenses", {
        body: JSON.stringify({
          action: "update_allocation",
          allocationId: allocation.id,
          update,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "No se pudo guardar la clasificacion.",
        );
      }
      setNotice("Distribucion clasificada correctamente.");
      await loadData();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo guardar la clasificacion.",
      );
    } finally {
      setBusy("");
    }
  }

  async function addAllocation(
    documentId: string,
    update: AllocationUpdate,
  ) {
    const busyKey = `add:${documentId}`;
    setBusy(busyKey);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/finance/cash-expenses", {
        body: JSON.stringify({
          action: "add_allocation",
          documentId,
          update,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo agregar la division.");
      }
      setNotice("Division de costo agregada.");
      await loadData();
      return true;
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "No se pudo agregar la division.",
      );
      return false;
    } finally {
      setBusy("");
    }
  }

  async function deleteAllocation(allocation: CashExpenseAllocation) {
    setBusy(allocation.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/finance/cash-expenses", {
        body: JSON.stringify({
          action: "delete_allocation",
          allocationId: allocation.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo eliminar la division.");
      }
      setNotice("Division de costo eliminada.");
      await loadData();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar la division.",
      );
    } finally {
      setBusy("");
    }
  }

  async function updateDocumentCashbox(
    documentId: string,
    cashboxName: string,
  ) {
    const currentDocument = bundle.documents.find(
      (document) => document.id === documentId,
    );
    const isConfirmed = currentDocument?.status === "confirmado";

    await patchDocument(
      documentId,
      {
        action: "update_document",
        documentId,
        update: { cashboxName },
      },
      isConfirmed
        ? "Caja corregida en el comprobante y sus movimientos."
        : "Caja revisada y guardada.",
      isConfirmed,
    );
  }

  return (
    <section className="cash-expense-workspace">
      <div className="cash-expense-commandbar">
        <div>
          <p className="eyebrow">Control de gastos</p>
          <h3>Comprobantes y distribucion por sector</h3>
          <p className="muted-text">
            Una salida de caja puede distribuirse entre varios centros de costo.
          </p>
        </div>
        <div className="cash-expense-actions">
          <label className="compact-field">
            Mes
            <input
              onChange={(event) => setPeriod(event.target.value)}
              type="month"
              value={period}
            />
          </label>
          {canEdit && (
            <button
              className="secondary-button"
              onClick={() => setShowEntry((current) => !current)}
              type="button"
            >
              {showEntry ? "Cerrar carga" : "Nuevo comprobante"}
            </button>
          )}
          {canAdmin && (
            <>
              <input
                accept=".json,application/json"
                className="visually-hidden"
                onChange={handleImportFile}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="submit-button"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Importar respaldo
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="status-banner error">{error}</div>}
      {notice && <div className="status-banner success">{notice}</div>}

      {showEntry && canEdit && (
        <CashExpenseEntry
          accounts={accounts}
          cashboxes={cashboxes}
          costCenters={costCenters}
          money={money}
          onCreated={async () => {
            setShowEntry(false);
            setNotice("Comprobante guardado como pendiente de revision.");
            await loadData();
          }}
        />
      )}

      <div className="cash-expense-kpis">
        <article>
          <span>Comprobantes del mes</span>
          <strong>{summary.count}</strong>
          <small>{summary.allocationCount} distribuciones</small>
        </article>
        <article>
          <span>Total documentado</span>
          <strong>{money(summary.total)}</strong>
          <small>Incluye pendientes y confirmados</small>
        </article>
        <article className="warning">
          <span>Pendiente de revision</span>
          <strong>{money(summary.pending)}</strong>
          <small>{summary.pendingCount} comprobantes</small>
        </article>
        <article className="positive">
          <span>Confirmado en Finanzas</span>
          <strong>{money(summary.confirmed)}</strong>
          <small>{summary.confirmedCount} comprobantes</small>
        </article>
      </div>

      <div className="cash-expense-tabs" role="tablist">
        {(
          [
            ["comprobantes", "Comprobantes", bundle.documents.length],
            [
              "conciliacion",
              "Operaciones por conciliar",
              bundle.commerceRecords.filter(
                (record) => record.status === "pendiente",
              ).length,
            ],
            ["importaciones", "Importaciones", bundle.batches.length],
          ] as Array<[CashExpenseView, string, number]>
        ).map(([id, label, count]) => (
          <button
            aria-selected={activeView === id}
            className={activeView === id ? "active" : ""}
            key={id}
            onClick={() => setActiveView(id)}
            role="tab"
            type="button"
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>

      {activeView === "comprobantes" && (
        <>
          <div className="cash-expense-filters">
            <label>
              Buscar
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Comprobante, proveedor, concepto o sector"
                value={search}
              />
            </label>
            <label>
              Estado
              <select
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as "todos" | CashExpenseStatus,
                  )
                }
                value={statusFilter}
              >
                <option value="todos">Todos</option>
                <option value="pendiente">Pendientes</option>
                <option value="confirmado">Confirmados</option>
                <option value="anulado">Anulados</option>
              </select>
            </label>
          </div>

          <div className="cash-expense-list">
            {visibleDocuments.length ? (
              visibleDocuments.map((document) => (
                <CashExpenseRow
                  accounts={accounts}
                  busy={busy}
                  cashboxBalances={bundle.cashboxBalances}
                  cashboxes={cashboxes}
                  canAdmin={canAdmin}
                  canEdit={canEdit}
                  costCenters={costCenters}
                  document={document}
                  expanded={expandedId === document.id}
                  key={document.id}
                  money={money}
                  onAddAllocation={addAllocation}
                  onDeleteAllocation={deleteAllocation}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === document.id ? "" : document.id,
                    )
                  }
                  onTransition={transitionDocument}
                  onUpdateAllocation={updateAllocation}
                  onUpdateCashbox={updateDocumentCashbox}
                />
              ))
            ) : (
              <div className="empty-state">
                No hay comprobantes para este mes y filtro.
              </div>
            )}
          </div>
        </>
      )}

      {activeView === "conciliacion" && (
        <CommerceReconciliation
          money={money}
          records={bundle.commerceRecords}
        />
      )}

      {activeView === "importaciones" && (
        <ImportHistory batches={bundle.batches} money={money} />
      )}

      {importPreview && (
        <div
          aria-modal="true"
          className="cash-expense-modal-backdrop"
          role="dialog"
        >
          <section className="cash-expense-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Importacion privada</p>
                <h3>Revisar respaldo antes de cargar</h3>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => setImportPreview(null)}
                type="button"
              >
                X
              </button>
            </div>
            <div className="import-preview-grid">
              <article>
                <span>Comprobantes</span>
                <strong>{importPreview.expenseCount}</strong>
              </article>
              <article>
                <span>Distribuciones</span>
                <strong>{importPreview.allocationCount}</strong>
              </article>
              <article>
                <span>Operaciones comerciales</span>
                <strong>{importPreview.commerceCount}</strong>
              </article>
              <article>
                <span>Total documentado</span>
                <strong>{money(importPreview.totalAmount)}</strong>
              </article>
            </div>
            <div className="status-banner warning">
              Los comprobantes se guardaran como pendientes. No modificaran los
              saldos financieros hasta revisar su clasificacion y confirmarlos.
            </div>
            {(importPreview.duplicateDocumentGroups > 0 ||
              importPreview.missingDocumentCount > 0 ||
              importPreview.missingResponsibleCount > 0) && (
              <div className="status-banner warning">
                Revision de calidad:{" "}
                {[
                  importPreview.duplicateDocumentGroups > 0
                    ? `${importPreview.duplicateDocumentGroups} numeros de comprobante repetidos`
                    : "",
                  importPreview.missingDocumentCount > 0
                    ? `${importPreview.missingDocumentCount} comprobantes sin numero`
                    : "",
                  importPreview.missingResponsibleCount > 0
                    ? `${importPreview.missingResponsibleCount} comprobantes sin responsable`
                    : "",
                ]
                  .filter(Boolean)
                  .join("; ")}
                . Se conservaran todos para su revision.
              </div>
            )}
            <dl className="import-file-detail">
              <div>
                <dt>Archivo</dt>
                <dd>{importPreview.fileName}</dd>
              </div>
              <div>
                <dt>Proteccion</dt>
                <dd>El mismo respaldo no puede importarse dos veces.</dd>
              </div>
            </dl>
            <div className="modal-actions">
              <button
                className="secondary-button"
                disabled={busy === "import"}
                onClick={() => setImportPreview(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="submit-button"
                disabled={busy === "import"}
                onClick={() => void importBackup()}
                type="button"
              >
                {busy === "import"
                  ? "Importando..."
                  : "Importar como pendiente"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function CashExpenseRow({
  accounts,
  busy,
  cashboxBalances,
  cashboxes,
  canAdmin,
  canEdit,
  costCenters,
  document,
  expanded,
  money,
  onAddAllocation,
  onDeleteAllocation,
  onToggle,
  onTransition,
  onUpdateAllocation,
  onUpdateCashbox,
}: {
  accounts: string[];
  busy: string;
  cashboxBalances: Record<string, number>;
  cashboxes: string[];
  canAdmin: boolean;
  canEdit: boolean;
  costCenters: string[];
  document: CashExpenseDocument;
  expanded: boolean;
  money: (value: number) => string;
  onAddAllocation: (
    documentId: string,
    update: AllocationUpdate,
  ) => Promise<boolean>;
  onDeleteAllocation: (
    allocation: CashExpenseAllocation,
  ) => Promise<void>;
  onToggle: () => void;
  onTransition: (
    documentId: string,
    status: "confirmado" | "anulado" | "pendiente",
  ) => Promise<void>;
  onUpdateAllocation: (
    allocation: CashExpenseAllocation,
    update: AllocationUpdate,
  ) => Promise<void>;
  onUpdateCashbox: (
    documentId: string,
    cashboxName: string,
  ) => Promise<void>;
}) {
  const automaticCount = document.allocations.filter(
    (allocation) => allocation.mappingStatus === "automatico",
  ).length;
  const [showAllocationEntry, setShowAllocationEntry] = useState(false);
  const allocatedTotal = document.allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );
  const allocationDifference = document.totalAmount - allocatedTotal;
  const allocationBalanced = Math.abs(allocationDifference) < 0.01;
  const canManageAllocations = canEdit && document.status === "pendiente";

  return (
    <article className={`cash-expense-row ${expanded ? "expanded" : ""}`}>
      <button
        className="cash-expense-row-summary"
        onClick={onToggle}
        type="button"
      >
        <span className="cash-expense-date">
          {formatDate(document.documentDate)}
        </span>
        <span className="cash-expense-description">
          <strong>{document.description}</strong>
          <small>
            {document.documentNumber || "Sin comprobante"} ·{" "}
            {document.supplier || "Sin proveedor"}
          </small>
        </span>
        <span className="cash-expense-origin">
          <strong>{document.cashboxName}</strong>
          <small>{document.paymentMethod || "Sin medio definido"}</small>
        </span>
        <span
          className={`cash-expense-status status-${document.status}`}
        >
          {document.status}
        </span>
        <strong className="cash-expense-amount">
          {money(document.totalAmount)}
        </strong>
        <span className="cash-expense-expand">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="cash-expense-detail">
          <CashboxImpactEditor
            busy={busy === document.id}
            canEdit={
              (canEdit && document.status === "pendiente") ||
              (canAdmin && document.status === "confirmado")
            }
            cashboxBalances={cashboxBalances}
            cashboxes={cashboxes}
            document={document}
            key={`${document.id}-${document.cashboxName}-${document.cashboxReviewed}`}
            money={money}
            onSave={onUpdateCashbox}
          />

          <div className="cash-expense-metadata">
            <dl>
              <div>
                <dt>Responsable</dt>
                <dd>{document.responsible || "Sin responsable"}</dd>
              </div>
              <div>
                <dt>Origen</dt>
                <dd>
                  {document.source === "respaldo_gastos_caja"
                    ? "Respaldo importado"
                    : "Carga manual"}
                </dd>
              </div>
              <div>
                <dt>Observacion</dt>
                <dd>{document.notes || "Sin observaciones"}</dd>
              </div>
            </dl>
            {automaticCount > 0 && document.status === "pendiente" && (
              <div className="status-banner warning">
                {automaticCount} distribuciones conservan una clasificacion
                automatica. Guarde cada linea despues de revisarla.
              </div>
            )}
          </div>

          <div className="cash-allocation-toolbar">
            <div>
              <strong>Divisiones de costo</strong>
              <small>
                Cada linea define donde se aplicara una parte del gasto.
              </small>
            </div>
            {canManageAllocations && (
              <button
                className="secondary-button"
                onClick={() => setShowAllocationEntry((current) => !current)}
                type="button"
              >
                {showAllocationEntry ? "Cancelar" : "Agregar division"}
              </button>
            )}
          </div>

          {showAllocationEntry && canManageAllocations && (
            <AllocationEntry
              accounts={accounts}
              busy={busy === `add:${document.id}`}
              costCenters={costCenters}
              onAdd={async (update) => {
                const created = await onAddAllocation(document.id, update);
                if (created) setShowAllocationEntry(false);
                return created;
              }}
              suggestedAmount={Math.max(allocationDifference, 0)}
            />
          )}

          <div
            className={`cash-allocation-balance ${
              allocationBalanced ? "balanced" : "unbalanced"
            }`}
          >
            <span>
              Total comprobante <strong>{money(document.totalAmount)}</strong>
            </span>
            <span>
              Total distribuido <strong>{money(allocatedTotal)}</strong>
            </span>
            <span>
              {allocationBalanced ? "Distribucion completa" : "Diferencia"}
              <strong>{money(Math.abs(allocationDifference))}</strong>
            </span>
          </div>

          <div className="cash-allocation-table">
            <div className="cash-allocation-head">
              <span>Origen recibido</span>
              <span>Modulo</span>
              <span>Cuenta contable</span>
              <span>Centro de costo</span>
              <span>Objeto asociado</span>
              <span>Monto</span>
              <span>Control</span>
            </div>
            {document.allocations.map((allocation) => (
              <AllocationRow
                accounts={accounts}
                allocation={allocation}
                busy={busy === allocation.id}
                canEdit={canEdit && document.status === "pendiente"}
                costCenters={costCenters}
                key={`${allocation.id}-${allocation.mappingStatus}-${allocation.accountName}-${allocation.costCenterName}-${allocation.costObjectName}-${allocation.linkedModule}-${allocation.amount}-${allocation.detail}`}
                money={money}
                onDelete={onDeleteAllocation}
                onSave={onUpdateAllocation}
              />
            ))}
          </div>

          <div className="cash-expense-detail-actions">
            {canAdmin && document.status === "pendiente" && (
              <>
                <button
                  className="danger-button"
                  disabled={busy === document.id}
                  onClick={() => void onTransition(document.id, "anulado")}
                  type="button"
                >
                  Anular
                </button>
                <button
                  className="submit-button"
                  disabled={
                    busy === document.id ||
                    automaticCount > 0 ||
                    !document.cashboxReviewed ||
                    !allocationBalanced
                  }
                  onClick={() =>
                    void onTransition(document.id, "confirmado")
                  }
                  type="button"
                >
                  Confirmar y contabilizar
                </button>
              </>
            )}
            {canAdmin && document.status === "confirmado" && (
              <button
                className="danger-button"
                disabled={busy === document.id}
                onClick={() => void onTransition(document.id, "anulado")}
                type="button"
              >
                Anular comprobante y movimientos
              </button>
            )}
            {canAdmin && document.status === "anulado" && (
              <button
                className="small-action-button"
                disabled={busy === document.id}
                onClick={() => void onTransition(document.id, "pendiente")}
                type="button"
              >
                Reabrir para corregir
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function CashboxImpactEditor({
  busy,
  canEdit,
  cashboxBalances,
  cashboxes,
  document,
  money,
  onSave,
}: {
  busy: boolean;
  canEdit: boolean;
  cashboxBalances: Record<string, number>;
  cashboxes: string[];
  document: CashExpenseDocument;
  money: (value: number) => string;
  onSave: (documentId: string, cashboxName: string) => Promise<void>;
}) {
  const [cashboxName, setCashboxName] = useState(document.cashboxName);

  const confirmedBalance = cashboxBalances[cashboxName] ?? 0;
  const isPending = document.status === "pendiente";
  const isCashboxChange = cashboxName !== document.cashboxName;
  const canSaveCashbox =
    Boolean(cashboxName) &&
    (!document.cashboxReviewed || isCashboxChange);
  const projectedBalance = isPending || isCashboxChange
    ? confirmedBalance - document.totalAmount
    : confirmedBalance;

  function saveCashbox() {
    if (
      document.status === "confirmado" &&
      isCashboxChange &&
      !window.confirm(
        `¿Desea mover este gasto confirmado de ${document.cashboxName} a ${cashboxName}?`,
      )
    ) {
      return;
    }
    void onSave(document.id, cashboxName);
  }

  return (
    <section className="cashbox-impact">
      <div className="cashbox-impact-editor">
        <span className="cashbox-impact-title">
          <strong>Caja afectada</strong>
          <small>
            {document.cashboxReviewed
              ? "Caja revisada"
              : "Pendiente de revisar"}
          </small>
        </span>
        <select
          disabled={!canEdit || busy}
          onChange={(event) => setCashboxName(event.target.value)}
          value={cashboxName}
        >
          {cashboxes.map((cashbox) => (
            <option key={cashbox}>{cashbox}</option>
          ))}
        </select>
        {canEdit && (
          <button
            className="small-action-button"
            disabled={busy || !canSaveCashbox}
            onClick={saveCashbox}
            type="button"
          >
            {busy
              ? "Guardando..."
              : document.status === "confirmado"
                ? "Cambiar caja"
                : "Guardar caja"}
          </button>
        )}
      </div>
      <dl className="cashbox-impact-values">
        <div>
          <dt>Saldo confirmado</dt>
          <dd>{money(confirmedBalance)}</dd>
        </div>
        <div>
          <dt>
            {isPending
              ? "Egreso al confirmar"
              : isCashboxChange
                ? "Egreso que se movera"
                : "Importe documentado"}
          </dt>
          <dd className="negative">
            {money(
              isPending || isCashboxChange
                ? -document.totalAmount
                : document.totalAmount,
            )}
          </dd>
        </div>
        <div>
          <dt>
            {isPending || isCashboxChange ? "Saldo proyectado" : "Saldo actual"}
          </dt>
          <dd className={projectedBalance < 0 ? "negative" : "positive"}>
            {money(projectedBalance)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function AllocationRow({
  accounts,
  allocation,
  busy,
  canEdit,
  costCenters,
  money,
  onDelete,
  onSave,
}: {
  accounts: string[];
  allocation: CashExpenseAllocation;
  busy: boolean;
  canEdit: boolean;
  costCenters: string[];
  money: (value: number) => string;
  onDelete: (allocation: CashExpenseAllocation) => Promise<void>;
  onSave: (
    allocation: CashExpenseAllocation,
    update: AllocationUpdate,
  ) => Promise<void>;
}) {
  const [accountName, setAccountName] = useState(allocation.accountName);
  const [costObjectName, setCostObjectName] = useState(
    allocation.costObjectName,
  );
  const [costCenterName, setCostCenterName] = useState(
    allocation.costCenterName,
  );
  const [linkedModule, setLinkedModule] = useState(allocation.linkedModule);
  const [amount, setAmount] = useState(String(allocation.amount));

  return (
    <div className="cash-allocation-row">
      <span className="allocation-source">
        <strong>{allocation.sourceCategory}</strong>
        <small>{allocation.sourceSubcategory}</small>
        <small>{allocation.detail || "Sin detalle"}</small>
      </span>
      <select
        disabled={!canEdit || busy}
        onChange={(event) =>
          setLinkedModule(event.target.value as LinkedModule)
        }
        value={linkedModule}
      >
        {linkedModules.map((module) => (
          <option key={module}>{module}</option>
        ))}
      </select>
      <select
        disabled={!canEdit || busy}
        onChange={(event) => setAccountName(event.target.value)}
        value={accountName}
      >
        {accounts.map((account) => (
          <option key={account}>{account}</option>
        ))}
      </select>
      <select
        disabled={!canEdit || busy}
        onChange={(event) => setCostCenterName(event.target.value)}
        value={costCenterName}
      >
        {costCenters.map((center) => (
          <option key={center}>{center}</option>
        ))}
      </select>
      <input
        disabled={!canEdit || busy}
        onChange={(event) => setCostObjectName(event.target.value)}
        placeholder="Vehiculo, persona, obra..."
        value={costObjectName}
      />
      {canEdit ? (
        <label className="allocation-amount-editor">
          <span>Gs.</span>
          <input
            aria-label="Monto de la division"
            disabled={busy}
            inputMode="numeric"
            min="1"
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            value={amount}
          />
        </label>
      ) : (
        <strong className="allocation-amount">{money(allocation.amount)}</strong>
      )}
      <span className="allocation-control">
        <span
          className={`mapping-pill ${allocation.mappingStatus}`}
        >
          {allocation.mappingStatus}
        </span>
        {canEdit && (
          <button
            className="small-action-button"
            onClick={() =>
              void onSave(allocation, {
                accountName,
                amount: numericValue(amount),
                costObjectName,
                costCenterName,
                detail: allocation.detail,
                linkedModule,
              })
            }
            disabled={busy || numericValue(amount) <= 0}
            type="button"
          >
            {busy ? "..." : "Guardar"}
          </button>
        )}
        {canEdit && (
          <button
            className="small-action-button danger"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Eliminar esta division de costo? Luego debera ajustar los importes restantes.",
                )
              ) {
                void onDelete(allocation);
              }
            }}
            type="button"
          >
            Eliminar
          </button>
        )}
      </span>
    </div>
  );
}

function AllocationEntry({
  accounts,
  busy,
  costCenters,
  onAdd,
  suggestedAmount,
}: {
  accounts: string[];
  busy: boolean;
  costCenters: string[];
  onAdd: (update: AllocationUpdate) => Promise<boolean>;
  suggestedAmount: number;
}) {
  const [draft, setDraft] = useState<DraftAllocation>(() => ({
    ...createDraftAllocation(accounts, costCenters),
    amount: suggestedAmount > 0 ? String(suggestedAmount) : "",
  }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onAdd({
      accountName: draft.accountName,
      amount: numericValue(draft.amount),
      costObjectName: draft.costObjectName,
      costCenterName: draft.costCenterName,
      detail: draft.detail,
      linkedModule: draft.linkedModule,
    });
  }

  return (
    <form className="cash-allocation-create" onSubmit={submit}>
      <label>
        Modulo
        <select
          disabled={busy}
          onChange={(event) =>
            setDraft({
              ...draft,
              linkedModule: event.target.value as LinkedModule,
            })
          }
          value={draft.linkedModule}
        >
          {linkedModules.map((module) => (
            <option key={module}>{module}</option>
          ))}
        </select>
      </label>
      <label>
        Cuenta contable
        <select
          disabled={busy}
          onChange={(event) =>
            setDraft({ ...draft, accountName: event.target.value })
          }
          value={draft.accountName}
        >
          {accounts.map((account) => (
            <option key={account}>{account}</option>
          ))}
        </select>
      </label>
      <label>
        Centro de costo
        <select
          disabled={busy}
          onChange={(event) =>
            setDraft({ ...draft, costCenterName: event.target.value })
          }
          value={draft.costCenterName}
        >
          {costCenters.map((center) => (
            <option key={center}>{center}</option>
          ))}
        </select>
      </label>
      <label>
        Objeto asociado
        <input
          disabled={busy}
          onChange={(event) =>
            setDraft({ ...draft, costObjectName: event.target.value })
          }
          placeholder="Vehiculo, persona, obra..."
          value={draft.costObjectName}
        />
      </label>
      <label>
        Detalle
        <input
          disabled={busy}
          onChange={(event) =>
            setDraft({ ...draft, detail: event.target.value })
          }
          value={draft.detail}
        />
      </label>
      <label>
        Monto
        <input
          disabled={busy}
          inputMode="numeric"
          min="1"
          onChange={(event) =>
            setDraft({ ...draft, amount: event.target.value })
          }
          required
          type="number"
          value={draft.amount}
        />
      </label>
      <button
        className="submit-button"
        disabled={busy || numericValue(draft.amount) <= 0}
        type="submit"
      >
        {busy ? "Agregando..." : "Agregar"}
      </button>
    </form>
  );
}

function CashExpenseEntry({
  accounts,
  cashboxes,
  costCenters,
  money,
  onCreated,
}: {
  accounts: string[];
  cashboxes: string[];
  costCenters: string[];
  money: (value: number) => string;
  onCreated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ExpenseDraft>({
    cashboxName: cashboxes[0] ?? "",
    description: "",
    documentDate: today,
    documentNumber: "",
    notes: "",
    paymentMethod: "Efectivo",
    responsible: "",
    supplier: "",
  });
  const [allocations, setAllocations] = useState<DraftAllocation[]>([
    createDraftAllocation(accounts, costCenters),
  ]);
  const total = allocations.reduce(
    (sum, allocation) => sum + numericValue(allocation.amount),
    0,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/finance/cash-expenses", {
        body: JSON.stringify({
          action: "create",
          allocations: allocations.map((allocation) => ({
            ...allocation,
            amount: numericValue(allocation.amount),
          })),
          document: draft,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo guardar.");
      }
      await onCreated();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo guardar.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateAllocation(
    index: number,
    patch: Partial<DraftAllocation>,
  ) {
    setAllocations((current) =>
      current.map((allocation, allocationIndex) =>
        allocationIndex === index
          ? { ...allocation, ...patch }
          : allocation,
      ),
    );
  }

  return (
    <form className="cash-expense-entry" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Nuevo registro</p>
          <h3>Cargar comprobante de gasto</h3>
        </div>
        <strong className="entry-total">{money(total)}</strong>
      </div>
      {error && <div className="status-banner error">{error}</div>}
      <div className="cash-entry-fields">
        <label>
          Fecha
          <input
            onChange={(event) =>
              setDraft({ ...draft, documentDate: event.target.value })
            }
            required
            type="date"
            value={draft.documentDate}
          />
        </label>
        <label>
          Comprobante
          <input
            onChange={(event) =>
              setDraft({ ...draft, documentNumber: event.target.value })
            }
            placeholder="Factura, recibo u OP"
            value={draft.documentNumber}
          />
        </label>
        <label>
          Caja de origen
          <select
            onChange={(event) =>
              setDraft({ ...draft, cashboxName: event.target.value })
            }
            required
            value={draft.cashboxName}
          >
            {cashboxes.map((cashbox) => (
              <option key={cashbox}>{cashbox}</option>
            ))}
          </select>
        </label>
        <label>
          Medio de pago
          <select
            onChange={(event) =>
              setDraft({ ...draft, paymentMethod: event.target.value })
            }
            value={draft.paymentMethod}
          >
            {[
              "Efectivo",
              "Transferencia",
              "Cheque",
              "Deposito",
              "Tarjeta",
              "Credito",
              "Otro",
            ].map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
        </label>
        <label>
          Proveedor o persona
          <input
            onChange={(event) =>
              setDraft({ ...draft, supplier: event.target.value })
            }
            value={draft.supplier}
          />
        </label>
        <label>
          Responsable
          <input
            onChange={(event) =>
              setDraft({ ...draft, responsible: event.target.value })
            }
            value={draft.responsible}
          />
        </label>
        <label className="span-2">
          Descripcion
          <input
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
            required
            value={draft.description}
          />
        </label>
        <label className="span-2">
          Observacion
          <input
            onChange={(event) =>
              setDraft({ ...draft, notes: event.target.value })
            }
            value={draft.notes}
          />
        </label>
      </div>

      <div className="entry-allocation-heading">
        <div>
          <strong>Distribucion del gasto</strong>
          <small>
            Asigne modulo, cuenta, centro, objeto asociado y monto.
          </small>
        </div>
        <button
          className="secondary-button"
          onClick={() =>
            setAllocations((current) => [
              ...current,
              createDraftAllocation(accounts, costCenters),
            ])
          }
          type="button"
        >
          Agregar distribucion
        </button>
      </div>

      <div className="entry-allocation-list">
        {allocations.map((allocation, index) => (
          <div className="entry-allocation-row" key={index}>
            <label>
              Modulo
              <select
                onChange={(event) =>
                  updateAllocation(index, {
                    linkedModule: event.target.value as LinkedModule,
                    sourceCategory: event.target.value,
                  })
                }
                value={allocation.linkedModule}
              >
                {linkedModules.map((module) => (
                  <option key={module}>{module}</option>
                ))}
              </select>
            </label>
            <label>
              Cuenta
              <select
                onChange={(event) =>
                  updateAllocation(index, {
                    accountName: event.target.value,
                  })
                }
                value={allocation.accountName}
              >
                {accounts.map((account) => (
                  <option key={account}>{account}</option>
                ))}
              </select>
            </label>
            <label>
              Centro de costo
              <select
                onChange={(event) =>
                  updateAllocation(index, {
                    costCenterName: event.target.value,
                    sourceSubcategory: event.target.value,
                  })
                }
                value={allocation.costCenterName}
              >
                {costCenters.map((center) => (
                  <option key={center}>{center}</option>
                ))}
              </select>
            </label>
            <label>
              Objeto asociado
              <input
                onChange={(event) =>
                  updateAllocation(index, {
                    costObjectName: event.target.value,
                  })
                }
                placeholder="Vehiculo, persona, obra..."
                value={allocation.costObjectName}
              />
            </label>
            <label>
              Detalle
              <input
                onChange={(event) =>
                  updateAllocation(index, { detail: event.target.value })
                }
                value={allocation.detail}
              />
            </label>
            <label>
              Monto
              <input
                inputMode="numeric"
                min="1"
                onChange={(event) =>
                  updateAllocation(index, { amount: event.target.value })
                }
                required
                type="number"
                value={allocation.amount}
              />
            </label>
            <button
              aria-label="Eliminar distribucion"
              className="icon-button danger"
              disabled={allocations.length === 1}
              onClick={() =>
                setAllocations((current) =>
                  current.filter(
                    (_, allocationIndex) => allocationIndex !== index,
                  ),
                )
              }
              type="button"
            >
              X
            </button>
          </div>
        ))}
      </div>

      <div className="form-actions">
        <span>
          Se guardara como pendiente y no afectara saldos hasta su confirmacion.
        </span>
        <button
          className="submit-button"
          disabled={busy || total <= 0}
          type="submit"
        >
          {busy ? "Guardando..." : "Guardar comprobante"}
        </button>
      </div>
    </form>
  );
}

function CommerceReconciliation({
  money,
  records,
}: {
  money: (value: number) => string;
  records: ImportedCommerceRecord[];
}) {
  const pending = records.filter((record) => record.status === "pendiente");
  const pendingAmount = pending.reduce(
    (sum, record) => sum + Math.max(record.amount - record.paidAmount, 0),
    0,
  );

  return (
    <section className="commerce-reconciliation">
      <div className="reconciliation-heading">
        <div>
          <p className="eyebrow">Datos conservados</p>
          <h3>Ventas, cobranzas y cuentas por conciliar</h3>
        </div>
        <div>
          <span>Saldo indicado por el respaldo</span>
          <strong>{money(pendingAmount)}</strong>
        </div>
      </div>
      <div className="status-banner warning">
        Estos registros fueron preservados, pero todavía no afectan Cuentas por
        cobrar o pagar. Deben vincularse para evitar duplicar ventas y cobros.
      </div>
      <div className="commerce-table">
        <div className="commerce-table-head">
          <span>Fecha</span>
          <span>Tipo</span>
          <span>Cliente / proveedor</span>
          <span>Documento</span>
          <span>Estado recibido</span>
          <span>Total</span>
          <span>Saldo</span>
        </div>
        {records.map((record) => (
          <div className="commerce-table-row" key={record.id}>
            <span>{formatDate(record.documentDate)}</span>
            <span>
              <strong>{record.sourceType}</strong>
              <small>{record.sourceCategory}</small>
            </span>
            <span>
              {record.clientName || record.supplierName || "Sin contraparte"}
            </span>
            <span>{record.documentNumber || "Sin documento"}</span>
            <span>
              <strong>{record.sourceStatus}</strong>
              <small className={`reconciliation-status ${record.status}`}>
                {record.status}
              </small>
            </span>
            <strong>{money(record.amount)}</strong>
            <strong>{money(Math.max(record.amount - record.paidAmount, 0))}</strong>
          </div>
        ))}
        {!records.length && (
          <div className="empty-state">
            No existen operaciones comerciales importadas.
          </div>
        )}
      </div>
    </section>
  );
}

function ImportHistory({
  batches,
  money,
}: {
  batches: CashExpenseImportBatch[];
  money: (value: number) => string;
}) {
  return (
    <section className="import-history">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Auditoria</p>
          <h3>Historial de respaldos importados</h3>
        </div>
      </div>
      <div className="import-history-list">
        {batches.map((batch) => (
          <article key={batch.id}>
            <span>
              <strong>{batch.fileName}</strong>
              <small>
                {formatDateTime(batch.createdAt)} ·{" "}
                {batch.importedByName || "Usuario del sistema"}
              </small>
            </span>
            <span>
              <strong>{batch.expenseCount} comprobantes</strong>
              <small>{batch.allocationCount} distribuciones</small>
            </span>
            <span>
              <strong>{batch.commerceCount} comerciales</strong>
              <small>Conservados para conciliacion</small>
            </span>
            <strong>{money(batch.totalAmount)}</strong>
          </article>
        ))}
        {!batches.length && (
          <div className="empty-state">Todavia no se importaron respaldos.</div>
        )}
      </div>
    </section>
  );
}

function inspectLegacyPayload(
  payload: Record<string, unknown>,
  fileName: string,
): ImportPreview {
  if (!Array.isArray(payload.expenses) || !payload.expenses.length) {
    throw new Error("El respaldo no contiene gastos.");
  }

  let allocationCount = 0;
  let missingDocumentCount = 0;
  let missingResponsibleCount = 0;
  let totalAmount = 0;
  const documentCounts = new Map<string, number>();
  payload.expenses.forEach((expense) => {
    if (!isRecord(expense) || !Array.isArray(expense.allocations)) {
      throw new Error("Existe un comprobante sin distribuciones validas.");
    }
    const documentNumber = cleanValue(expense.comprobante);
    if (documentNumber) {
      documentCounts.set(
        documentNumber,
        (documentCounts.get(documentNumber) ?? 0) + 1,
      );
    } else {
      missingDocumentCount += 1;
    }
    if (!cleanValue(expense.responsable)) {
      missingResponsibleCount += 1;
    }
    expense.allocations.forEach((allocation) => {
      if (!isRecord(allocation)) {
        throw new Error("Existe una distribucion con formato invalido.");
      }
      const amount = Number(allocation.monto);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Existe una distribucion con monto invalido.");
      }
      allocationCount += 1;
      totalAmount += amount;
    });
  });

  return {
    allocationCount,
    commerceCount: Array.isArray(payload.commerceRecords)
      ? payload.commerceRecords.length
      : 0,
    duplicateDocumentGroups: [...documentCounts.values()].filter(
      (count) => count > 1,
    ).length,
    expenseCount: payload.expenses.length,
    fileName,
    missingDocumentCount,
    missingResponsibleCount,
    payload,
    totalAmount,
  };
}

function buildExpenseSummary(documents: CashExpenseDocument[]) {
  return documents.reduce(
    (summary, document) => {
      summary.count += 1;
      summary.total += document.totalAmount;
      summary.allocationCount += document.allocations.length;
      if (document.status === "pendiente") {
        summary.pending += document.totalAmount;
        summary.pendingCount += 1;
      }
      if (document.status === "confirmado") {
        summary.confirmed += document.totalAmount;
        summary.confirmedCount += 1;
      }
      return summary;
    },
    {
      allocationCount: 0,
      confirmed: 0,
      confirmedCount: 0,
      count: 0,
      pending: 0,
      pendingCount: 0,
      total: 0,
    },
  );
}

function createDraftAllocation(
  accounts: string[],
  costCenters: string[],
): DraftAllocation {
  return {
    accountName: accounts.includes("Otros") ? "Otros" : accounts[0] ?? "",
    amount: "",
    costObjectName: "",
    costCenterName: costCenters.includes("General")
      ? "General"
      : costCenters[0] ?? "",
    detail: "",
    linkedModule: "General",
    sourceCategory: "General",
    sourceSubcategory: "General",
  };
}

function mergeCatalogs(primary: string[], fallback: string[]) {
  return Array.from(
    new Set([...primary, ...fallback].map((value) => value.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "es"));
}

function numericValue(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}
