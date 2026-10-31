import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Check, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPlannerInputsQueryKey,
  useGetBudgetExtras,
  useGetBudgetLines,
  useGetPlannerHouseTypes,
  useGetPlannerInputs,
  useUpdatePlannerInputs,
  useUpdatePlannerSalePrices,
} from "@workspace/api-client-react";
import type {
  PlannerInputs,
  PlannerInputsUpdate,
  PlannerSalePriceRow,
} from "@workspace/api-client-react";
import { calculatePackTotals } from "@workspace/engine/packs";
import {
  calculateHouseTypeComparisonRows,
  calculatePlannerPackResults,
  calculatePlannerPresentation,
  calculateSalePriceMetrics,
  inputsForPack,
  type HouseTypePlannerInputs,
  type PlannerConstructionBreakdown,
  type PlannerPackTotals,
  type PlannerPresentation,
} from "@workspace/engine/planner";

type CurrencyCode = "EUR" | "GBP" | "USD";
type PlannerField = Exclude<keyof PlannerInputsUpdate, "landNote">;
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
};

const packDefinitions = [
  { id: "standard", label: "Standard" },
  { id: "eco", label: "Eco" },
  { id: "premium", label: "Premium" },
] as const;
type PackId = (typeof packDefinitions)[number]["id"];

type SalePriceCellDraft = {
  price: string;
  note: string;
};
type SalePriceDraft = Record<PackId, SalePriceCellDraft>;
type SalePriceDrafts = Record<string, SalePriceDraft>;
type SalePriceCellField = keyof SalePriceCellDraft;

function nullableNumberText(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function nullableText(value: string | null | undefined): string {
  return value ?? "";
}

function salePriceDraftFromInputs(inputs?: PlannerInputs): SalePriceDraft {
  return {
    standard: {
      price: nullableNumberText(inputs?.standardReferenceSellingPrice),
      note: nullableText(inputs?.priceNoteStandard),
    },
    eco: {
      price: nullableNumberText(inputs?.ecoReferenceSellingPrice),
      note: nullableText(inputs?.priceNoteEco),
    },
    premium: {
      price: nullableNumberText(inputs?.premiumReferenceSellingPrice),
      note: nullableText(inputs?.priceNotePremium),
    },
  };
}

function nullableNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function nullableNote(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function savedSalePrice(inputs: PlannerInputs | undefined, pack: PackId): number | null {
  if (!inputs) return null;
  return {
    standard: inputs.standardReferenceSellingPrice,
    eco: inputs.ecoReferenceSellingPrice,
    premium: inputs.premiumReferenceSellingPrice,
  }[pack];
}

function savedSalePriceNote(
  inputs: PlannerInputs | undefined,
  pack: PackId,
): string | null {
  if (!inputs) return null;
  return {
    standard: inputs.priceNoteStandard,
    eco: inputs.priceNoteEco,
    premium: inputs.priceNotePremium,
  }[pack];
}

function salePriceCellIsDirty(
  draft: SalePriceCellDraft,
  savedInputs: PlannerInputs | undefined,
  pack: PackId,
): boolean {
  const draftPrice = nullableNumber(draft.price);
  const savedPrice = savedSalePrice(savedInputs, pack);
  const priceChanged = Number.isNaN(draftPrice)
    ? true
    : draftPrice !== savedPrice;
  return (
    priceChanged ||
    nullableNote(draft.note) !== savedSalePriceNote(savedInputs, pack)
  );
}

function salePriceRowFromDraft(
  houseTypeId: string,
  draft: SalePriceDraft,
): PlannerSalePriceRow {
  return {
    houseTypeId,
    standardReferenceSellingPrice: nullableNumber(draft.standard.price),
    ecoReferenceSellingPrice: nullableNumber(draft.eco.price),
    premiumReferenceSellingPrice: nullableNumber(draft.premium.price),
    priceNoteStandard: nullableNote(draft.standard.note),
    priceNoteEco: nullableNote(draft.eco.note),
    priceNotePremium: nullableNote(draft.premium.note),
  };
}

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

function draftFromInputs(inputs?: PlannerInputs): PlannerDraft {
  return {
    grossArea: inputs?.grossArea == null ? "" : String(inputs.grossArea),
    land: inputs?.land == null ? "" : String(inputs.land),
    designLicensing:
      inputs?.designLicensing == null ? "" : String(inputs.designLicensing),
    managementPercent:
      inputs?.managementPercent == null ? "" : String(inputs.managementPercent),
    contingencyPercent:
      inputs?.contingencyPercent == null ? "" : String(inputs.contingencyPercent),
    targetNetMarginPercent:
      inputs?.targetNetMarginPercent == null
        ? ""
        : String(inputs.targetNetMarginPercent),
    salesCommissionPercent:
      inputs?.salesCommissionPercent == null
        ? ""
        : String(inputs.salesCommissionPercent),
    taxesPercent:
      inputs?.taxesPercent == null ? "" : String(inputs.taxesPercent),
  };
}

function inputsFromDraft(
  draft: PlannerDraft,
  landNote: string,
): PlannerInputsUpdate {
  const parseValue = (value: string) =>
    value.trim() === "" ? null : Number(value);
  return {
    landNote: landNote.trim() === "" ? null : landNote,
    grossArea: parseValue(draft.grossArea),
    land: parseValue(draft.land),
    designLicensing: parseValue(draft.designLicensing),
    managementPercent: parseValue(draft.managementPercent),
    contingencyPercent: parseValue(draft.contingencyPercent),
    targetNetMarginPercent: parseValue(draft.targetNetMarginPercent),
    salesCommissionPercent: parseValue(draft.salesCommissionPercent),
    taxesPercent: parseValue(draft.taxesPercent),
  };
}

function engineInputsFromUpdate(
  inputs: PlannerInputsUpdate,
  salePrices: SalePriceDraft,
): HouseTypePlannerInputs {
  const { landNote: _landNote, ...engineInputs } = inputs;
  return {
    ...engineInputs,
    standardReferenceSellingPrice: nullableNumber(salePrices.standard.price),
    ecoReferenceSellingPrice: nullableNumber(salePrices.eco.price),
    premiumReferenceSellingPrice: nullableNumber(salePrices.premium.price),
  };
}

function engineInputsFromSaved(
  inputs: PlannerInputs | undefined,
): HouseTypePlannerInputs | null {
  if (!inputs) return null;
  return {
    grossArea: inputs.grossArea,
    land: inputs.land,
    designLicensing: inputs.designLicensing,
    managementPercent: inputs.managementPercent,
    contingencyPercent: inputs.contingencyPercent,
    targetNetMarginPercent: inputs.targetNetMarginPercent,
    salesCommissionPercent: inputs.salesCommissionPercent,
    taxesPercent: inputs.taxesPercent,
    standardReferenceSellingPrice: inputs.standardReferenceSellingPrice,
    ecoReferenceSellingPrice: inputs.ecoReferenceSellingPrice,
    premiumReferenceSellingPrice: inputs.premiumReferenceSellingPrice,
  };
}

function engineInputsWithSalePrices(
  inputs: PlannerInputs | undefined,
  salePrices: SalePriceDraft,
): HouseTypePlannerInputs | null {
  const saved = engineInputsFromSaved(inputs);
  if (!saved) return null;
  return {
    ...saved,
    standardReferenceSellingPrice: nullableNumber(salePrices.standard.price),
    ecoReferenceSellingPrice: nullableNumber(salePrices.eco.price),
    premiumReferenceSellingPrice: nullableNumber(salePrices.premium.price),
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
  const houseTypesQuery = useGetPlannerHouseTypes();
  const inputsQuery = useGetPlannerInputs();
  const linesQuery = useGetBudgetLines();
  const extrasQuery = useGetBudgetExtras();
  const updateInputs = useUpdatePlannerInputs();
  const updateSalePrices = useUpdatePlannerSalePrices();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PlannerDraft>(emptyDraft);
  const [landNote, setLandNote] = useState("");
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [salePriceDrafts, setSalePriceDrafts] = useState<SalePriceDrafts>({});
  const [salePriceNotice, setSalePriceNotice] = useState("");
  const [salePriceSaveError, setSalePriceSaveError] = useState("");
  const [selectedHouseTypeId, setSelectedHouseTypeId] = useState("");
  const [selectedPack, setSelectedPack] = useState<PackId>("standard");
  const hydratedHouseTypeId = useRef("");

  useEffect(() => {
    const houseTypes = houseTypesQuery.data;
    if (!houseTypes?.length) return;
    setSelectedHouseTypeId((current) =>
      houseTypes.some((houseType) => houseType.id === current)
        ? current
        : houseTypes[0].id,
    );
  }, [houseTypesQuery.data]);

  const selectedHouseType = houseTypesQuery.data?.find(
    (houseType) => houseType.id === selectedHouseTypeId,
  );
  const savedInputs = inputsQuery.data?.find(
    (inputs) => inputs.houseTypeId === selectedHouseTypeId,
  );

  useEffect(() => {
    if (!selectedHouseTypeId || inputsQuery.isLoading) return;
    if (hydratedHouseTypeId.current === selectedHouseTypeId) return;
    setDraft(draftFromInputs(savedInputs));
    setLandNote(savedInputs?.landNote ?? "");
    setNotice("");
    setSaveError("");
    hydratedHouseTypeId.current = selectedHouseTypeId;
  }, [selectedHouseTypeId, inputsQuery.isLoading, savedInputs]);

  useEffect(() => {
    if (!houseTypesQuery.data || inputsQuery.isLoading) return;
    setSalePriceDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const houseType of houseTypesQuery.data!) {
        if (next[houseType.id]) continue;
        next[houseType.id] = salePriceDraftFromInputs(
          inputsQuery.data?.find(
            (row) => row.houseTypeId === houseType.id,
          ),
        );
        changed = true;
      }
      return changed ? next : current;
    });
  }, [houseTypesQuery.data, inputsQuery.data, inputsQuery.isLoading]);

  const inputs = useMemo(
    () => inputsFromDraft(draft, landNote),
    [draft, landNote],
  );
  const selectedSalePriceDraft =
    salePriceDrafts[selectedHouseTypeId] ??
    salePriceDraftFromInputs(savedInputs);
  const engineInputs = useMemo(
    () => engineInputsFromUpdate(inputs, selectedSalePriceDraft),
    [inputs, selectedSalePriceDraft],
  );
  const packTotals = useMemo(() => {
    if (!linesQuery.data || !extrasQuery.data) return null;
    return calculatePackTotals(linesQuery.data, extrasQuery.data);
  }, [linesQuery.data, extrasQuery.data]);
  const results = useMemo(() => {
    if (!packTotals) return null;
    return calculatePlannerPackResults(
      {
        standard: packTotals.standard.total,
        eco: packTotals.eco.total,
        premium: packTotals.premium.total,
      },
      engineInputs,
    );
  }, [engineInputs, packTotals]);
  const presentations = useMemo<Record<PackId, PlannerPresentation> | null>(() => {
    if (!packTotals || !results) return null;
    return {
      standard: calculatePlannerPresentation(
        results.standard,
        inputsForPack(engineInputs, "standard"),
        constructionBreakdown(packTotals.standard),
      ),
      eco: calculatePlannerPresentation(
        results.eco,
        inputsForPack(engineInputs, "eco"),
        constructionBreakdown(packTotals.eco),
      ),
      premium: calculatePlannerPresentation(
        results.premium,
        inputsForPack(engineInputs, "premium"),
        constructionBreakdown(packTotals.premium),
      ),
    };
  }, [engineInputs, packTotals, results]);

  const comparisonRows = useMemo(() => {
    if (!packTotals || !houseTypesQuery.data) return [];
    const totals: PlannerPackTotals = {
      standard: packTotals.standard.total,
      eco: packTotals.eco.total,
      premium: packTotals.premium.total,
    };
    return calculateHouseTypeComparisonRows(
      totals,
      houseTypesQuery.data.map((houseType) => ({
        id: houseType.id,
        name: houseType.name,
        costBasis: houseType.costBasis,
        inputs: engineInputsWithSalePrices(
          inputsQuery.data?.find(
            (saved) => saved.houseTypeId === houseType.id,
          ),
          salePriceDrafts[houseType.id] ??
            salePriceDraftFromInputs(
              inputsQuery.data?.find(
                (saved) => saved.houseTypeId === houseType.id,
              ),
            ),
        ),
      })),
    );
  }, [houseTypesQuery.data, inputsQuery.data, packTotals, salePriceDrafts]);

  const salePriceMatrixRows = useMemo(() => {
    if (!packTotals || !houseTypesQuery.data) return [];
    return houseTypesQuery.data.map((houseType) => {
      const saved = inputsQuery.data?.find(
        (row) => row.houseTypeId === houseType.id,
      );
      const salePrices =
        salePriceDrafts[houseType.id] ?? salePriceDraftFromInputs(saved);
      const engineInputs = engineInputsFromSaved(saved);
      return {
        houseType,
        saved,
        salePrices,
        metrics: {
          standard: calculateSalePriceMetrics(
            packTotals.standard.total,
            engineInputs,
            "standard",
            nullableNumber(salePrices.standard.price),
          ),
          eco: calculateSalePriceMetrics(
            packTotals.eco.total,
            engineInputs,
            "eco",
            nullableNumber(salePrices.eco.price),
          ),
          premium: calculateSalePriceMetrics(
            packTotals.premium.total,
            engineInputs,
            "premium",
            nullableNumber(salePrices.premium.price),
          ),
        },
      };
    });
  }, [houseTypesQuery.data, inputsQuery.data, packTotals, salePriceDrafts]);

  const dirtySalePriceRows = useMemo(() => {
    if (!houseTypesQuery.data) return [];
    return houseTypesQuery.data.flatMap((houseType) => {
      const saved = inputsQuery.data?.find(
        (row) => row.houseTypeId === houseType.id,
      );
      const salePrices =
        salePriceDrafts[houseType.id] ?? salePriceDraftFromInputs(saved);
      const isDirty = packDefinitions.some(({ id }) =>
        salePriceCellIsDirty(salePrices[id], saved, id),
      );
      return isDirty
        ? [salePriceRowFromDraft(houseType.id, salePrices)]
        : [];
    });
  }, [houseTypesQuery.data, inputsQuery.data, salePriceDrafts]);

  const updateSalePriceDraftCell = (
    houseTypeId: string,
    pack: PackId,
    field: SalePriceCellField,
    value: string,
  ) => {
    const saved = inputsQuery.data?.find(
      (row) => row.houseTypeId === houseTypeId,
    );
    setSalePriceDrafts((current) => {
      const existing =
        current[houseTypeId] ?? salePriceDraftFromInputs(saved);
      return {
        ...current,
        [houseTypeId]: {
          ...existing,
          [pack]: { ...existing[pack], [field]: value },
        },
      };
    });
    setSalePriceNotice("");
    setSalePriceSaveError("");
  };

  const saveSalePrices = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalidPrice = dirtySalePriceRows.some((row) =>
      [
        row.standardReferenceSellingPrice,
        row.ecoReferenceSellingPrice,
        row.premiumReferenceSellingPrice,
      ].some((value) => value !== null && !Number.isFinite(value)),
    );
    if (invalidPrice) {
      setSalePriceSaveError("Enter a valid number for each completed sale price.");
      setSalePriceNotice("");
      return;
    }
    if (dirtySalePriceRows.length === 0) return;
    setSalePriceSaveError("");
    setSalePriceNotice("");
    updateSalePrices.mutate(
      { data: { rows: dirtySalePriceRows } },
      {
        onSuccess: (savedRows) => {
          setSalePriceDrafts((current) => {
            const next = { ...current };
            for (const row of savedRows) {
              next[row.houseTypeId] = {
                standard: {
                  price: nullableNumberText(row.standardReferenceSellingPrice),
                  note: nullableText(row.priceNoteStandard),
                },
                eco: {
                  price: nullableNumberText(row.ecoReferenceSellingPrice),
                  note: nullableText(row.priceNoteEco),
                },
                premium: {
                  price: nullableNumberText(row.premiumReferenceSellingPrice),
                  note: nullableText(row.priceNotePremium),
                },
              };
            }
            return next;
          });
          setSalePriceNotice("Sale prices and notes saved.");
          void queryClient.invalidateQueries({
            queryKey: getGetPlannerInputsQueryKey(),
          });
        },
        onError: () => {
          setSalePriceSaveError("Could not save the sale prices and notes.");
        },
      },
    );
  };

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
    if (!selectedHouseTypeId) {
      setSaveError("Choose a house type before saving assumptions.");
      setNotice("");
      return;
    }
    setSaveError("");
    setNotice("");
    updateInputs.mutate(
      { houseTypeId: selectedHouseTypeId, data: inputs },
      {
        onSuccess: (saved) => {
          setDraft(draftFromInputs(saved));
          setLandNote(saved.landNote ?? "");
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
        <div className="eyebrow">
          WORKSPACE / {selectedHouseType?.name.toUpperCase() ?? "HOUSE TYPE"} · ONE HOUSE UNIT
        </div>
        <h1>Planner</h1>
        <p>
          Compare the three pack outcomes for {selectedHouseType?.name ?? "this type"} using its saved assumptions.
        </p>
      </div>
    </div>
  );

  if (
    houseTypesQuery.isLoading ||
    inputsQuery.isLoading ||
    linesQuery.isLoading ||
    extrasQuery.isLoading
  ) {
    return (
      <div>
        {pageHeader}
        <div className="metric-placeholder">Loading planner inputs and pack totals…</div>
      </div>
    );
  }

  if (
    houseTypesQuery.isError ||
    inputsQuery.isError ||
    linesQuery.isError ||
    extrasQuery.isError
  ) {
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

      <section
        className="panel planner-sale-prices"
        aria-labelledby="planner-sale-prices-heading"
      >
        <div className="planner-sale-prices-header">
          <div>
            <div className="eyebrow">SALE PRICES</div>
            <h2 id="planner-sale-prices-heading">Sale prices</h2>
            <p>One house unit · add a note describing the price source.</p>
          </div>
          <span className="pill attention"><i />ASSUMPTION</span>
        </div>
        <form onSubmit={saveSalePrices}>
          <div className="planner-sale-price-table-wrap">
            <table className="planner-sale-price-table">
              <thead>
                <tr>
                  <th scope="col">House type</th>
                  {packDefinitions.map(({ id, label }) => (
                    <th scope="col" key={id}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salePriceMatrixRows.map(({ houseType, saved, salePrices, metrics }) => (
                  <tr key={houseType.id}>
                    <th scope="row">{houseType.name}</th>
                    {packDefinitions.map(({ id, label }) => {
                      const cell = salePrices[id];
                      const dirty = salePriceCellIsDirty(cell, saved, id);
                      return (
                        <td key={id}>
                          <div className="planner-sale-price-cell">
                            <label className="planner-sale-price-input-label">
                              <span className="sr-only">
                                {houseType.name} {label} sale price
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={cell.price}
                                onChange={(event) =>
                                  updateSalePriceDraftCell(
                                    houseType.id,
                                    id,
                                    "price",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="planner-sale-price-note-label">
                              <span className="sr-only">
                                {houseType.name} {label} price source note
                              </span>
                              <input
                                type="text"
                                placeholder="Estimate, comparable sale, offer received"
                                value={cell.note}
                                onChange={(event) =>
                                  updateSalePriceDraftCell(
                                    houseType.id,
                                    id,
                                    "note",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            {dirty && <span className="planner-sale-price-unsaved">unsaved</span>}
                            <div className="planner-sale-price-metrics">
                              <span>
                                ROI
                                <strong>{formatPercent(metrics[id].roi)}</strong>
                                {houseType.costBasis === "Twin CSV (provisional)" && (
                                  <span className="pill attention planner-provisional-roi">
                                    <i />PROVISIONAL
                                  </span>
                                )}
                              </span>
                              <span>
                                Sale price / m²
                                <strong>
                                  {formatCurrency(
                                    metrics[id].salePricePerSquareMeter,
                                    currencyCode,
                                  )}
                                </strong>
                              </span>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {salePriceNotice && (
            <div className="inline-message" role="status">
              <Check size={15} />
              {salePriceNotice}
            </div>
          )}
          {salePriceSaveError && (
            <div className="inline-message" role="alert">
              <AlertCircle size={15} />
              {salePriceSaveError}
            </div>
          )}
          <div className="form-actions planner-sale-price-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={
                updateSalePrices.isPending || dirtySalePriceRows.length === 0
              }
            >
              <Save size={14} />
              {updateSalePrices.isPending ? "Saving…" : "Save sale prices"}
            </button>
          </div>
        </form>
      </section>

      <div
        className="planner-house-type-tabs"
        role="tablist"
        aria-label="Choose a house type"
      >
        {houseTypesQuery.data?.map((houseType, index) => (
          <button
            aria-controls="planner-house-type-panel"
            aria-selected={selectedHouseTypeId === houseType.id}
            className="planner-house-type-tab"
            id={`planner-house-type-tab-${houseType.id}`}
            key={houseType.id}
            onClick={() => setSelectedHouseTypeId(houseType.id)}
            onKeyDown={(event) => {
              const nextIndex =
                event.key === "ArrowRight"
                  ? (index + 1) % houseTypesQuery.data!.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + houseTypesQuery.data!.length) %
                      houseTypesQuery.data!.length
                    : null;
              if (nextIndex !== null) {
                event.preventDefault();
                const nextHouseType = houseTypesQuery.data![nextIndex];
                setSelectedHouseTypeId(nextHouseType.id);
                document
                  .getElementById(`planner-house-type-tab-${nextHouseType.id}`)
                  ?.focus();
              }
            }}
            role="tab"
            tabIndex={selectedHouseTypeId === houseType.id ? 0 : -1}
            type="button"
          >
            {houseType.name}
          </button>
        ))}
      </div>

      {selectedHouseType?.costBasis === "Twin CSV (provisional)" && (
        <div className="planner-provisional-banner" role="note">
          Costs for this type use the Twin CSV (provisional). Import a
          type-specific CSV to change this.
        </div>
      )}

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

      <section
        className="panel register-panel"
        id="planner-house-type-panel"
        aria-labelledby={`planner-house-type-tab-${selectedHouseTypeId}`}
      >
        <div className="register-toolbar">
          <div>
            <div className="eyebrow">ASSUMPTIONS</div>
            <strong>{selectedHouseType?.name ?? "House type"} · one house unit</strong>
          </div>
          <span className="pill attention"><i />ASSUMPTION</span>
        </div>
        <form className="form-grid recent-panel" onSubmit={save}>
          {fieldDefinitions.map(({ key, label, step }) =>
            key === "land" ? (
              <div className="planner-land-inputs" key={key}>
                <label className="form-field">
                  <span>Land · ASSUMPTION</span>
                  <input
                    type="number"
                    step={step}
                    value={draft.land}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        land: event.target.value,
                      }));
                      setNotice("");
                      setSaveError("");
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>Land note</span>
                  <input
                    type="text"
                    value={landNote}
                    onChange={(event) => {
                      setLandNote(event.target.value);
                      setNotice("");
                      setSaveError("");
                    }}
                  />
                </label>
              </div>
            ) : (
              <label className="form-field" key={key}>
                <span>{label} · ASSUMPTION</span>
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
            ),
          )}
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
                      <span>Sale price used</span>
                      <strong>
                        {formatCurrency(
                          inputsForPack(engineInputs, pack.id).referenceSellingPrice,
                          currencyCode,
                        )}
                      </strong>
                    </div>
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

          <section
            className="panel planner-house-type-comparison"
            aria-labelledby="planner-house-type-comparison-heading"
          >
            <div className="section-heading">
              <div>
                <div className="eyebrow">HOUSE TYPE COMPARISON</div>
                <h2 id="planner-house-type-comparison-heading">Compare house types</h2>
              </div>
            </div>
            <div className="planner-house-type-table-wrap">
              <table className="planner-house-type-table">
                <thead>
                  <tr>
                    <th scope="col">House type</th>
                    <th scope="col">Land</th>
                    <th scope="col">Standard</th>
                    <th scope="col">Eco</th>
                    <th scope="col">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr
                      className={
                        row.id === selectedHouseTypeId ? "is-selected" : ""
                      }
                      key={row.id}
                    >
                      <th scope="row">
                        <div className="planner-house-type-name">
                          <span>{row.name}</span>
                          {row.costBasis === "Twin CSV (provisional)" && (
                            <span className="pill attention">
                              <i />
                              PROVISIONAL
                            </span>
                          )}
                        </div>
                      </th>
                      <td>{formatCurrency(row.land, currencyCode)}</td>
                      {packDefinitions.map(({ id }) => {
                        const metrics = row[id];
                        return (
                          <td key={id}>
                            <div className="planner-house-type-pack-metrics">
                              <span>
                                <em>Net profit</em>
                                <strong>{formatCurrency(metrics.netProfit, currencyCode)}</strong>
                              </span>
                              <span>
                                <em>Net margin</em>
                                <strong>{formatPercent(metrics.netMargin)}</strong>
                              </span>
                              <span>
                                <em>ROI</em>
                                <strong>{formatPercent(metrics.roi)}</strong>
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
