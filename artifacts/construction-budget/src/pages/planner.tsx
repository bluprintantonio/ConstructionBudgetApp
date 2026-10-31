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
  calculatePremiumPlanner,
  type PlannerPackResult,
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
  {
    key: "premiumAdjustmentPct",
    label: "Premium what-if adjustment (%)",
    step: "1",
  },
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
  premiumAdjustmentPct: "",
};

const packDefinitions = [
  { id: "standard", label: "Standard" },
  { id: "eco", label: "Eco" },
  { id: "premium", label: "Premium" },
] as const;

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
    premiumAdjustmentPct:
      inputs.premiumAdjustmentPct == null
        ? ""
        : String(inputs.premiumAdjustmentPct),
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
    premiumAdjustmentPct: parseValue(draft.premiumAdjustmentPct),
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
      premium: calculatePremiumPlanner(
        packTotals.premium.fromCsvLines,
        packTotals.premium.fromExtras,
        inputs,
      ),
    };
  }, [inputs, packTotals]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalidAdjustment =
      draft.premiumAdjustmentPct.trim() !== "" &&
      !Number.isInteger(Number(draft.premiumAdjustmentPct));
    const invalid = fieldDefinitions.some(({ key }) => {
      const value = draft[key].trim();
      return value !== "" && !Number.isFinite(Number(value));
    });
    if (invalid || invalidAdjustment) {
      setSaveError(
        invalidAdjustment
          ? "Premium what-if adjustment must be a whole number."
          : "Enter a valid number in each completed field.",
      );
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

  const plannerPacks = results
    ? packDefinitions.map(({ id, label }) => ({
        id,
        label,
        result: results[id],
      }))
    : [];
  const hasRequiredPriceError = plannerPacks.some(
    (pack) => pack.result.requiredSalePriceError,
  );
  const premiumWhatIfNote =
    inputs.premiumAdjustmentPct !== null &&
    Number.isFinite(inputs.premiumAdjustmentPct) &&
    inputs.premiumAdjustmentPct !== 0
      ? `What-if: CSV lines adjusted by ${inputs.premiumAdjustmentPct}%`
      : null;
  const summaryCards: {
    title: string;
    value: (result: PlannerPackResult) => string;
    detail?: (result: PlannerPackResult) => string;
    error?: (result: PlannerPackResult) => boolean;
  }[] = [
    {
      title: "Development cost",
      value: (result) => formatCurrency(result.developmentCost, currencyCode),
      detail: (result) =>
        `€/m²: ${formatCurrency(result.costPerSquareMeter, currencyCode)}`,
    },
    {
      title: "Required sale price",
      value: (result) => formatCurrency(result.requiredSalePrice, currencyCode),
      error: (result) => result.requiredSalePriceError,
    },
    {
      title: "Net profit",
      value: (result) => formatCurrency(result.netProfit, currencyCode),
      detail: (result) =>
        result.viable === null
          ? "Viability: —"
          : result.viable
            ? "Viable"
            : "Not viable",
    },
    {
      title: "Net margin",
      value: (result) => formatPercent(result.netMargin),
    },
    {
      title: "ROI",
      value: (result) => formatPercent(result.roi),
    },
  ];

  return (
    <div>
      {pageHeader}
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
                {label} ·{" "}
                {key === "premiumAdjustmentPct"
                  ? "ASSUMPTION / WHAT-IF"
                  : "ASSUMPTION"}
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

      <div className="section-heading">
        <div>
          <div className="eyebrow">PACK COMPARISON</div>
          <h2>Same assumptions · one house unit</h2>
        </div>
      </div>
      <div className="metrics-grid">
        {summaryCards.map((card, index) => (
          <article
            className="metric-tile fade-up"
            key={card.title}
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <div className="metric-top">
              <span className="source-col">{card.title.toUpperCase()}</span>
              <span className="pill neutral"><i />ONE UNIT</span>
            </div>
            <div className="metric-label">Standard / Eco / Premium</div>
            {plannerPacks.map((pack) => {
              const hasError = card.error?.(pack.result) ?? false;
              return (
                <div className="building-row" key={pack.id}>
                  <div className="building-name">
                    <strong>{pack.label}</strong>
                    {card.detail && <span>{card.detail(pack.result)}</span>}
                    {pack.id === "premium" && premiumWhatIfNote && (
                      <span>{premiumWhatIfNote}</span>
                    )}
                  </div>
                  {hasError ? (
                    <span className="pill bad"><i />Error</span>
                  ) : (
                    <strong>{card.value(pack.result)}</strong>
                  )}
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </div>
  );
}
