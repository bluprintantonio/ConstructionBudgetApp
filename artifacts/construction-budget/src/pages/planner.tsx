import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Check, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPlannerInputsQueryKey,
  useGetBudgetExtras,
  useGetBudgetLines,
  useGetPlannerInputs,
  useUpdatePlannerInputs,
} from "@workspace/api-client-react";
import type {
  PlannerInputs,
  PlannerInputsUpdate,
} from "@workspace/api-client-react";
import { calculatePackTotals } from "@workspace/engine/packs";
import {
  calculatePlanner,
  calculatePlannerPresentation,
  type PlannerConstructionBreakdown,
  type PlannerPresentation,
} from "@workspace/engine/planner";

type CurrencyCode = "EUR" | "GBP" | "USD";
type PlannerField = keyof PlannerInputsUpdate;
type PlannerDraft = Record<PlannerField, string>;

const fieldDefinitions: {
  key: PlannerField;
  label: string;
  step: string;
}[] = [
  { key: "grossArea", label: "Gross area (m²)", step: "any" },
  { key: "land", label: "Land", step: "0.01" },
  { key: "designLicensing", label: "Design/licensing", step: "0.01" },
  { key: "managementPercent", label: "Management (%)", step: "0.01" },
  { key: "contingencyPercent", label: "Contingency (%)", step: "0.01" },
  { key: "targetNetMarginPercent", label: "Target NET margin (%)", step: "0.01" },
  { key: "salesCommissionPercent", label: "Sales commission (%)", step: "0.01" },
  { key: "taxesPercent", label: "Taxes (%)", step: "0.01" },
  { key: "referenceSellingPrice", label: "Reference selling price", step: "0.01" },
];

const emptyDraft: PlannerDraft = {
  grossArea: "",
  land: "",
  designLicensing: "",
  managementPercent: "",
  contingencyPercent: "",
  targetNetMarginPercent: "",
  salesCommissionPercent: "",
  taxesPercent: "",
  referenceSellingPrice: "",
};

const packDefinitions = [
  { id: "standard", label: "Standard" },
  { id: "eco", label: "Eco" },
  { id: "premium", label: "Premium" },
] as const;
type PackId = (typeof packDefinitions)[number]["id"];

function constructionBreakdown(pack: {
  total: number;
  fromCsvLines: number;
  fromCommonLines: number | null;
  fromPremiumRatedLines: number | null;
  fromExtras: number;
}): PlannerConstructionBreakdown {
  return {
    constructionCost: pack.total,
    csvLines: pack.fromCommonLines ?? pack.fromCsvLines,
    premiumRatedLines: pack.fromPremiumRatedLines,
    extras: pack.fromExtras,
  };
}

function draftFromInputs(inputs: PlannerInputs): PlannerDraft {
  return {
    grossArea: inputs.grossArea == null ? "" : String(inputs.grossArea),
    land: inputs.land == null ? "" : String(inputs.land),
    designLicensing:
      inputs.designLicensing == null ? "" : String(inputs.designLicensing),
    managementPercent:
      inputs.managementPercent == null ? "" : String(inputs.managementPercent),
    contingencyPercent:
      inputs.contingencyPercent == null ? "" : String(inputs.contingencyPercent),
    targetNetMarginPercent:
      inputs.targetNetMarginPercent == null
        ? ""
        : String(inputs.targetNetMarginPercent),
    salesCommissionPercent:
      inputs.salesCommissionPercent == null
        ? ""
        : String(inputs.salesCommissionPercent),
    taxesPercent: inputs.taxesPercent == null ? "" : String(inputs.taxesPercent),
    referenceSellingPrice:
      inputs.referenceSellingPrice == null
        ? ""
        : String(inputs.referenceSellingPrice),
  };
}

function inputsFromDraft(draft: PlannerDraft): PlannerInputsUpdate {
  const parseValue = (value: string) =>
    value.trim() === "" ? null : Number(value);
  return {
    grossArea: parseValue(draft.grossArea),
    land: parseValue(draft.land),
    designLicensing: parseValue(draft.designLicensing),
    managementPercent: parseValue(draft.managementPercent),
    contingencyPercent: parseValue(draft.contingencyPercent),
    targetNetMarginPercent: parseValue(draft.targetNetMarginPercent),
    salesCommissionPercent: parseValue(draft.salesCommissionPercent),
    taxesPercent: parseValue(draft.taxesPercent),
    referenceSellingPrice: parseValue(draft.referenceSellingPrice),
  };
}

function formatCurrency(value: number | null, code: CurrencyCode): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PlannerPage({
  currencyCode,
}: {
  currencyCode: CurrencyCode;
}) {
  const inputsQuery = useGetPlannerInputs();
  const linesQuery = useGetBudgetLines();
  const extrasQuery = useGetBudgetExtras();
  const updateInputs = useUpdatePlannerInputs();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PlannerDraft>(emptyDraft);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [selectedPack, setSelectedPack] = useState<PackId>("standard");

  useEffect(() => {
    if (inputsQuery.data) setDraft(draftFromInputs(inputsQuery.data));
  }, [inputsQuery.data]);

  const inputs = useMemo(() => inputsFromDraft(draft), [draft]);
  const packTotals = useMemo(() => {
    if (!linesQuery.data || !extrasQuery.data) return null;
    return calculatePackTotals(linesQuery.data, extrasQuery.data);
  }, [linesQuery.data, extrasQuery.data]);
  const results = useMemo(() => {
    if (!packTotals) return null;
    return {
      standard: calculatePlanner(packTotals.standard.total, inputs),
      eco: calculatePlanner(packTotals.eco.total, inputs),
      premium: calculatePlanner(packTotals.premium.total, inputs),
    };
  }, [inputs, packTotals]);
  const presentations = useMemo<Record<PackId, PlannerPresentation> | null>(() => {
    if (!packTotals || !results) return null;
    return {
      standard: calculatePlannerPresentation(
        results.standard,
        inputs,
        constructionBreakdown(packTotals.standard),
      ),
      eco: calculatePlannerPresentation(
        results.eco,
        inputs,
        constructionBreakdown(packTotals.eco),
      ),
      premium: calculatePlannerPresentation(
        results.premium,
        inputs,
        constructionBreakdown(packTotals.premium),
      ),
    };
  }, [inputs, packTotals, results]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = fieldDefinitions.some(({ key }) => {
      const value = draft[key].trim();
      return value !== "" && !Number.isFinite(Number(value));
    });
    if (invalid) {
      setSaveError("Enter a valid number in each completed field.");
      setNotice("");
      return;
    }
    setSaveError("");
    setNotice("");
    updateInputs.mutate(
      { data: inputs },
      {
        onSuccess: (saved) => {
          setDraft(draftFromInputs(saved));
          setNotice("Assumptions saved to the database.");
          void queryClient.invalidateQueries({
            queryKey: getGetPlannerInputsQueryKey(),
          });
        },
        onError: () => setSaveError("Could not save the assumptions."),
      },
    );
  };

  const pageHeader = (
    <div className="page-heading fade-up">
      <div>
        <div className="eyebrow">WORKSPACE / ONE HOUSE UNIT</div>
        <h1>Planner</h1>
        <p>Compare the three pack outcomes using saved assumptions.</p>
      </div>
    </div>
  );

  if (inputsQuery.isLoading || linesQuery.isLoading || extrasQuery.isLoading) {
    return (
      <div>
        {pageHeader}
        <div className="metric-placeholder">Loading planner inputs and pack totals…</div>
      </div>
    );
  }

  if (inputsQuery.isError || linesQuery.isError || extrasQuery.isError) {
    return (
      <div>
        {pageHeader}
        <div className="inline-message" role="alert">
          <AlertCircle size={15} />
          Could not load the saved inputs or pack totals. Refresh the page to retry.
        </div>
      </div>
    );
  }

  const plannerPacks =
    results && presentations && packTotals
      ? packDefinitions.map(({ id, label }) => ({
          id,
          label,
          result: results[id],
          presentation: presentations[id],
          packTotal: packTotals[id],
        }))
      : [];
  const selectedResult = results?.[selectedPack] ?? null;
  const selectedPresentation = presentations?.[selectedPack] ?? null;
  const selectedPackTotal = packTotals?.[selectedPack] ?? null;
  const hasRequiredPriceError = plannerPacks.some(
    (pack) => pack.result.requiredSalePriceError,
  );

  return (
    <div className="planner-page">
      {pageHeader}

      <div className="planner-pack-tabs" role="tablist" aria-label="Choose a pack">
        {packDefinitions.map(({ id, label }) => (
          <button
            aria-controls="planner-panel"
            aria-selected={selectedPack === id}
            className="planner-pack-tab"
            data-pack={id}
            id={`planner-pack-tab-${id}`}
            key={id}
            onClick={() => setSelectedPack(id)}
            onKeyDown={(event) => {
              const currentIndex = packDefinitions.findIndex(
                (pack) => pack.id === id,
              );
              const nextIndex =
                event.key === "ArrowRight"
                  ? (currentIndex + 1) % packDefinitions.length
                  : event.key === "ArrowLeft"
                    ? (currentIndex - 1 + packDefinitions.length) %
                      packDefinitions.length
                    : null;
              if (nextIndex !== null) {
                event.preventDefault();
                const nextPack = packDefinitions[nextIndex];
                setSelectedPack(nextPack.id);
                document
                  .getElementById(`planner-pack-tab-${nextPack.id}`)
                  ?.focus();
              }
            }}
            role="tab"
            tabIndex={selectedPack === id ? 0 : -1}
            type="button"
          >
            <span className="planner-pack-swatch" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <section className="panel register-panel">
        <div className="register-toolbar">
          <div>
            <div className="eyebrow">ASSUMPTIONS</div>
            <strong>One house unit</strong>
          </div>
          <span className="pill attention"><i />ASSUMPTION</span>
        </div>
        <form className="form-grid recent-panel" onSubmit={save}>
          {fieldDefinitions.map(({ key, label, step }) => (
            <label className="form-field" key={key}>
              <span>
                {label} · ASSUMPTION
              </span>
              <input
                type="number"
                step={step}
                value={draft[key]}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }));
                  setNotice("");
                  setSaveError("");
                }}
              />
            </label>
          ))}
          <div className="form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={updateInputs.isPending}
            >
              <Save size={14} />
              {updateInputs.isPending ? "Saving…" : "Save assumptions"}
            </button>
          </div>
        </form>
      </section>

      {notice && (
        <div className="inline-message" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
      {saveError && (
        <div className="inline-message" role="alert">
          <AlertCircle size={15} />
          {saveError}
        </div>
      )}
      {hasRequiredPriceError && (
        <div className="inline-message" role="alert">
          <AlertCircle size={15} />
          Target NET margin, sales commission and taxes must total less than 100%
          to calculate the required sale price.
        </div>
      )}

      {selectedResult && selectedPresentation && selectedPackTotal && (
        <div
          aria-labelledby={`planner-pack-tab-${selectedPack}`}
          className="planner-panel"
          id="planner-panel"
          role="tabpanel"
        >
          <section
            aria-label={`${packDefinitions.find((pack) => pack.id === selectedPack)?.label} pack key figures`}
            className="planner-kpi-grid"
            data-pack={selectedPack}
          >
            <article className="metric-tile planner-kpi" data-pack={selectedPack}>
              <div className="metric-top">
                <span className="source-col">DEVELOPMENT COST / M²</span>
                <span className="pill neutral"><i />{packDefinitions.find((pack) => pack.id === selectedPack)?.label}</span>
              </div>
              <strong className="planner-kpi-value">
                {formatCurrency(selectedResult.costPerSquareMeter, currencyCode)}
              </strong>
            </article>
            <article className="metric-tile planner-kpi" data-pack={selectedPack}>
              <div className="metric-top">
                <span className="source-col">REQUIRED SALE PRICE / M²</span>
                <span className="pill neutral"><i />{packDefinitions.find((pack) => pack.id === selectedPack)?.label}</span>
              </div>
              <strong className="planner-kpi-value">
                {selectedResult.requiredSalePriceError
                  ? "Error"
                  : formatCurrency(
                      selectedPresentation.requiredSalePricePerSquareMeter,
                      currencyCode,
                    )}
              </strong>
            </article>
            <article className="metric-tile planner-kpi" data-pack={selectedPack}>
              <div className="metric-top">
                <span className="source-col">NET PROFIT AT REFERENCE PRICE</span>
                <span className="pill neutral"><i />{packDefinitions.find((pack) => pack.id === selectedPack)?.label}</span>
              </div>
              <strong className="planner-kpi-value">
                {formatCurrency(selectedResult.netProfit, currencyCode)}
              </strong>
            </article>
            <article className="metric-tile planner-kpi" data-pack={selectedPack}>
              <div className="metric-top">
                <span className="source-col">ROI</span>
                <span className="pill neutral"><i />{packDefinitions.find((pack) => pack.id === selectedPack)?.label}</span>
              </div>
              <strong className="planner-kpi-value">
                {formatPercent(selectedResult.roi)}
              </strong>
            </article>
          </section>

          <div className="planner-outcome-grid">
            <section
              className="panel planner-waterfall"
              data-pack={selectedPack}
              aria-labelledby="planner-waterfall-heading"
            >
              <div className="planner-card-heading">
                <div>
                  <div className="eyebrow">COST WATERFALL</div>
                  <h2 id="planner-waterfall-heading">One house unit</h2>
                </div>
                <span className="planner-pack-badge" data-pack={selectedPack}>
                  {packDefinitions.find((pack) => pack.id === selectedPack)?.label}
                </span>
              </div>
              {selectedPresentation.waterfallSections.map((section) => (
                <div className="planner-waterfall-section" key={section.id}>
                  <h3>{section.title}</h3>
                  {section.rows.map((row) => (
                    <div
                      className={`planner-waterfall-row${row.id.endsWith("total") || row.id === "net-profit" ? " is-total" : ""}${row.isNegative ? " is-negative" : ""}`}
                      key={row.id}
                    >
                      <span className="planner-waterfall-label">{row.label}</span>
                      <strong className="planner-waterfall-amount">
                        {formatCurrency(row.amount, currencyCode)}
                      </strong>
                      <span className="planner-waterfall-percent">
                        {formatPercent(row.percentOfReferencePrice)}
                      </span>
                      {row.barWidthPercent !== null && (
                        <div className="planner-waterfall-track" aria-hidden="true">
                          <span
                            className="planner-waterfall-fill"
                            style={{ width: `${row.barWidthPercent}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </section>

            <section
              className="panel planner-viability"
              data-pack={selectedPack}
              aria-labelledby="planner-viability-heading"
            >
              <div className="planner-card-heading">
                <div>
                  <div className="eyebrow">VIABILITY</div>
                  <h2 id="planner-viability-heading">At reference price</h2>
                </div>
                {selectedResult.viable !== null && (
                  <span className={`pill ${selectedResult.viable ? "good" : "bad"}`}>
                    <i />
                    {selectedResult.viable ? "Viable" : "Not viable"}
                  </span>
                )}
              </div>
              <span className="planner-viability-label">Net margin</span>
              <strong className="planner-viability-margin">
                {formatPercent(selectedResult.netMargin)}
              </strong>
              <div className="planner-viability-stats">
                <div>
                  <span>ROI</span>
                  <strong>{formatPercent(selectedResult.roi)}</strong>
                </div>
                <div>
                  <span>Net profit</span>
                  <strong>{formatCurrency(selectedResult.netProfit, currencyCode)}</strong>
                </div>
              </div>
              {selectedPresentation.viabilityScale && (
                <div className="planner-viability-chart">
                  <div
                    className="planner-viability-track"
                    role="img"
                    aria-label={`Net margin ${formatPercent(selectedResult.netMargin)}; zero marker and target margin marker`}
                  >
                    {selectedPresentation.viabilityScale.fillStartPercent !== null &&
                      selectedPresentation.viabilityScale.fillWidthPercent !== null && (
                        <span
                          className={`planner-viability-fill${selectedPresentation.viabilityScale.currentIsPositive ? " is-positive" : " is-negative"}`}
                          style={{
                            left: `${selectedPresentation.viabilityScale.fillStartPercent}%`,
                            width: `${selectedPresentation.viabilityScale.fillWidthPercent}%`,
                          }}
                        />
                      )}
                    <span
                      className="planner-viability-marker is-zero"
                      style={{
                        left: `${selectedPresentation.viabilityScale.zeroPositionPercent}%`,
                      }}
                    />
                    {selectedPresentation.viabilityScale.targetPositionPercent !== null && (
                      <span
                        className="planner-viability-marker is-target"
                        style={{
                          left: `${selectedPresentation.viabilityScale.targetPositionPercent}%`,
                        }}
                      />
                    )}
                    {selectedPresentation.viabilityScale.currentPositionPercent !== null && (
                      <span
                        className="planner-viability-marker is-current"
                        style={{
                          left: `${selectedPresentation.viabilityScale.currentPositionPercent}%`,
                        }}
                      />
                    )}
                  </div>
                  <div className="planner-viability-axis-labels">
                    <span
                      style={{
                        left: `${selectedPresentation.viabilityScale.zeroPositionPercent}%`,
                      }}
                    >
                      0%
                    </span>
                    {selectedPresentation.viabilityScale.targetPositionPercent !== null && (
                      <span
                        style={{
                          left: `${selectedPresentation.viabilityScale.targetPositionPercent}%`,
                        }}
                      >
                        Target {formatPercent(selectedPresentation.viabilityScale.targetMargin)}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="planner-viability-warnings">
                {selectedPackTotal.pendingExtraCount > 0 && (
                  <div className="planner-assumption-warning">
                    <AlertCircle size={14} />
                    {selectedPackTotal.pendingExtraCount} extras pending a price
                  </div>
                )}
                <div className="planner-assumption-warning">
                  <AlertCircle size={14} />
                  Reference price is an assumption
                </div>
              </div>
            </section>
          </div>

          <section className="planner-comparison" aria-labelledby="planner-comparison-heading">
            <div className="section-heading">
              <div>
                <div className="eyebrow">PACK COMPARISON</div>
                <h2 id="planner-comparison-heading">Same assumptions · one house unit</h2>
              </div>
            </div>
            <div className="planner-comparison-grid">
              {plannerPacks.map((pack) => (
                <article
                  className={`panel planner-comparison-card${pack.id === selectedPack ? " is-selected" : ""}`}
                  data-pack={pack.id}
                  key={pack.id}
                >
                  <div className="planner-comparison-heading">
                    <div>
                      <div className="eyebrow">CONSTRUCTION COST</div>
                      <h3>{pack.label}</h3>
                    </div>
                    <strong>{formatCurrency(pack.packTotal.total, currencyCode)}</strong>
                  </div>
                  <div className="planner-comparison-values">
                    <div>
                      <span>Development cost</span>
                      <strong>{formatCurrency(pack.result.developmentCost, currencyCode)}</strong>
                    </div>
                    <div>
                      <span>Required sale price</span>
                      <strong>
                        {pack.result.requiredSalePriceError
                          ? "Error"
                          : formatCurrency(pack.result.requiredSalePrice, currencyCode)}
                      </strong>
                    </div>
                    <div>
                      <span>Net profit</span>
                      <strong>{formatCurrency(pack.result.netProfit, currencyCode)}</strong>
                    </div>
                    <div>
                      <span>Net margin</span>
                      <strong>{formatPercent(pack.result.netMargin)}</strong>
                    </div>
                    <div>
                      <span>ROI</span>
                      <strong>{formatPercent(pack.result.roi)}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
