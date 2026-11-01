import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  Building2,
  Check,
  CircleDollarSign,
  House,
  Leaf,
  Ruler,
  Save,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
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
const plannerViews = [
  { id: "waterfall", label: "Cost waterfall" },
  { id: "outcomes", label: "All three pack outcomes" },
  { id: "sale-prices", label: "Sale prices" },
] as const;
type PlannerView = (typeof plannerViews)[number]["id"];

function readPlannerViewFromUrl(): PlannerView {
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "outcomes" || view === "sale-prices" ? view : "waterfall";
}

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
  const [, setLocation] = useLocation();
  const [draft, setDraft] = useState<PlannerDraft>(emptyDraft);
  const [landNote, setLandNote] = useState("");
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [salePriceDrafts, setSalePriceDrafts] = useState<SalePriceDrafts>({});
  const [salePriceNotice, setSalePriceNotice] = useState("");
  const [salePriceSaveError, setSalePriceSaveError] = useState("");
  const [selectedHouseTypeId, setSelectedHouseTypeId] = useState("");
  const [selectedPack, setSelectedPack] = useState<PackId>("standard");
  const [selectedView, setSelectedView] = useState<PlannerView>(readPlannerViewFromUrl);
  const hydratedHouseTypeId = useRef("");

  useEffect(() => {
    const syncViewFromUrl = () => setSelectedView(readPlannerViewFromUrl());
    window.addEventListener("popstate", syncViewFromUrl);
    return () => window.removeEventListener("popstate", syncViewFromUrl);
  }, []);

  const chooseView = (view: PlannerView) => {
    setSelectedView(view);
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    void setLocation(`/planner?${params.toString()}`);
  };

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
    <div className="planner-hero fade-up">
      <div className="planner-hero-copy">
        <div className="planner-hero-eyebrow">FONTAINHAS VILLAGE · DEVELOPMENT MODEL</div>
        <h1>Planner <span>· {selectedHouseType?.name ?? "House type"}</span></h1>
        <p>
          Compare the three pack outcomes for{" "}
          {selectedHouseType?.name ?? "this type"} using its saved assumptions.
        </p>
      </div>
      <div className="planner-hero-mark" aria-hidden="true"><House size={27} strokeWidth={1.5} /></div>
    </div>
  );

  if (
    houseTypesQuery.isLoading ||
    inputsQuery.isLoading ||
    linesQuery.isLoading ||
    extrasQuery.isLoading
  ) {
    return (
      <div className="planner-page">
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
      <div className="planner-page">
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

  const houseTypeIcons = [House, Building2, Sparkles];
  const packIcons = { standard: Sparkles, eco: Leaf, premium: Zap };
  const assumptionGroups: { title: string; keys: PlannerField[]; icon: typeof House }[] = [
    { title: "House profile", keys: ["grossArea"], icon: Ruler },
    { title: "Land & planning", keys: ["land", "designLicensing"], icon: Building2 },
    { title: "Fees & reserves", keys: ["managementPercent", "contingencyPercent"], icon: CircleDollarSign },
    { title: "Sale assumptions", keys: ["targetNetMarginPercent", "salesCommissionPercent", "taxesPercent"], icon: Target },
  ];
  const amountForField = (key: PlannerField) => {
    if (key === "managementPercent") return selectedResult?.managementFee ?? null;
    if (key === "contingencyPercent") return selectedResult?.contingency ?? null;
    if (key === "salesCommissionPercent") {
      return selectedPresentation?.commissionAtReferencePrice ?? null;
    }
    if (key === "taxesPercent") {
      return selectedPresentation?.taxesAtReferencePrice ?? null;
    }
    return null;
  };
  const showComputedAmount = (key: PlannerField) =>
    key === "managementPercent" ||
    key === "contingencyPercent" ||
    key === "salesCommissionPercent" ||
    key === "taxesPercent";
  const fieldInput = (key: PlannerField) => {
    const definition = fieldDefinitions.find((field) => field.key === key)!;
    const isPercent = key.endsWith("Percent");
    return (
      <label className="planner-assumption-field" key={key}>
        <span className="planner-assumption-label">{definition.label}<small>ASSUMPTION</small></span>
        <div className="planner-input-line">
          <span className="planner-input-prefix">{isPercent ? "%" : key === "grossArea" ? "m²" : "€"}</span>
          <input
            aria-label={definition.label}
            type="number"
            step={definition.step}
            value={draft[key]}
            onChange={(event) => {
              setDraft((current) => ({ ...current, [key]: event.target.value }));
              setNotice("");
              setSaveError("");
            }}
          />
          {showComputedAmount(key) && (
            <strong className="planner-computed-amount">{formatCurrency(amountForField(key), currencyCode)}</strong>
          )}
        </div>
      </label>
    );
  };

  return (
    <div className="planner-page">
      {pageHeader}
      <section className="planner-choice-section" aria-label="House types">
        <div className="planner-section-caption"><span>01</span> SELECT HOUSE TYPE</div>
        <div className="planner-house-type-tabs" role="tablist" aria-label="Choose a house type">
          {houseTypesQuery.data?.map((houseType, index) => {
            const Icon = houseTypeIcons[index % houseTypeIcons.length];
            return (
              <button
                aria-controls="planner-house-type-panel"
                aria-selected={selectedHouseTypeId === houseType.id}
                className="planner-house-type-tab"
                id={`planner-house-type-tab-${houseType.id}`}
                key={houseType.id}
                onClick={() => setSelectedHouseTypeId(houseType.id)}
                onKeyDown={(event) => {
                  const nextIndex = event.key === "ArrowRight"
                    ? (index + 1) % houseTypesQuery.data!.length
                    : event.key === "ArrowLeft"
                      ? (index - 1 + houseTypesQuery.data!.length) % houseTypesQuery.data!.length
                      : null;
                  if (nextIndex !== null) {
                    event.preventDefault();
                    const nextType = houseTypesQuery.data![nextIndex];
                    setSelectedHouseTypeId(nextType.id);
                    document.getElementById(`planner-house-type-tab-${nextType.id}`)?.focus();
                  }
                }}
                role="tab"
                tabIndex={selectedHouseTypeId === houseType.id ? 0 : -1}
                type="button"
              >
                <Icon size={20} strokeWidth={1.7} />
                <span>{houseType.name}</span>
                {houseType.costBasis === "Twin CSV (provisional)" && <small>PROVISIONAL COST BASIS</small>}
              </button>
            );
          })}
        </div>
      </section>

      {selectedHouseType?.costBasis === "Twin CSV (provisional)" && (
        <div className="planner-provisional-banner" role="note">
          Costs for this type use the Twin CSV (provisional). Import a type-specific CSV to change this.
        </div>
      )}

      <section className="planner-choice-section planner-pack-choice" aria-label="Estimate pack">
        <div className="planner-section-caption"><span>02</span> CHOOSE FINISHING PACK</div>
        <div className="planner-pack-tabs" role="tablist" aria-label="Choose a pack">
          {packDefinitions.map(({ id, label }) => {
            const Icon = packIcons[id];
            const pack = packTotals?.[id];
            return (
              <button
                aria-controls="planner-panel"
                aria-selected={selectedPack === id}
                className="planner-pack-tab"
                data-pack={id}
                id={`planner-pack-tab-${id}`}
                key={id}
                onClick={() => setSelectedPack(id)}
                role="tab"
                tabIndex={selectedPack === id ? 0 : -1}
                type="button"
              >
                <span className="planner-pack-card-icon"><Icon size={19} /></span>
                <span className="planner-pack-card-copy"><strong>{label}</strong></span>
                <b>{formatCurrency(pack?.total ?? null, currencyCode)}</b>
              </button>
            );
          })}
        </div>
      </section>

      {selectedResult && selectedPresentation && selectedPackTotal && (
        <div
          aria-labelledby={`planner-pack-tab-${selectedPack}`}
          className="planner-panel"
          id="planner-panel"
          role="tabpanel"
        >
          <section className="planner-kpi-grid" aria-label={`${packDefinitions.find((pack) => pack.id === selectedPack)?.label} pack key figures`} data-pack={selectedPack}>
            {[
              { label: "Development cost / m²", value: formatCurrency(selectedResult.costPerSquareMeter, currencyCode), icon: Building2, detail: "Total cost per gross area" },
              { label: "Required sale price / m²", value: selectedResult.requiredSalePriceError ? "—" : formatCurrency(selectedPresentation.requiredSalePricePerSquareMeter, currencyCode), icon: Target, detail: "To reach the target margin" },
              { label: "Net profit", value: formatCurrency(selectedResult.netProfit, currencyCode), icon: CircleDollarSign, detail: "At saved reference price" },
              { label: "ROI", value: formatPercent(selectedResult.roi), icon: Sparkles, detail: "At saved reference price" },
            ].map(({ label, value, icon: Icon, detail }) => (
              <article className="planner-kpi" data-pack={selectedPack} key={label}>
                <div className="planner-kpi-icon"><Icon size={18} /></div>
                <span className="planner-kpi-label">{label}</span>
                <strong className="planner-kpi-value">{value}</strong>
                <small>{detail}</small>
              </article>
            ))}
          </section>

          <div className="planner-analysis-grid">
            <div className="planner-left-column">
              <section className="panel planner-views" aria-label="Planner views">
                <div className="planner-section-title">
                  <div><div className="planner-section-caption"><span>03</span> PLANNER VIEWS</div><h2>Views</h2></div>
                </div>
                <div className="planner-view-options" role="group" aria-label="Choose a Planner view">
                  {plannerViews.map(({ id, label }) => (
                    <button
                      aria-pressed={selectedView === id}
                      className="planner-view-button"
                      data-selected={selectedView === id}
                      key={id}
                      onClick={() => chooseView(id)}
                      type="button"
                    >
                      <span>{label}</span>
                      <span className="planner-view-button-indicators">
                        {id === "sale-prices" && dirtySalePriceRows.length > 0 && (
                          <span className="planner-view-unsaved-dot" role="img" aria-label="Unsaved sale-price edits" />
                        )}
                        {selectedView === id && <Check size={15} aria-hidden="true" />}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="planner-assumptions" id="planner-house-type-panel" aria-labelledby={`planner-house-type-tab-${selectedHouseTypeId}`}>
                <div className="planner-section-title">
                  <div><div className="planner-section-caption"><span>04</span> SAVED INPUTS</div><h2>Planning assumptions</h2></div>
                  <span className="pill attention"><i />ASSUMPTION</span>
                </div>
                <form onSubmit={save}>
                  <div className="planner-assumption-groups">
                    {assumptionGroups.map(({ title, keys, icon: Icon }) => (
                      <section className="planner-assumption-card" key={title}>
                        <h3><Icon size={16} />{title}</h3>
                        {keys.map(fieldInput)}
                        {title === "Land & planning" && (
                          <label className="planner-assumption-field planner-note-field">
                            <span className="planner-assumption-label">Land source note</span>
                            <input
                              aria-label="Land source note"
                              type="text"
                              value={landNote}
                              onChange={(event) => {
                                setLandNote(event.target.value);
                                setNotice("");
                                setSaveError("");
                              }}
                            />
                          </label>
                        )}
                      </section>
                    ))}
                  </div>
                  <div className="planner-form-footer">
                    <span>Saved per house type · one house unit</span>
                    <button className="button button-primary" type="submit" disabled={updateInputs.isPending}>
                      <Save size={14} />{updateInputs.isPending ? "Saving…" : "Save assumptions"}
                    </button>
                  </div>
                </form>
                {notice && <div className="inline-message" role="status"><Check size={15} />{notice}</div>}
                {saveError && <div className="inline-message" role="alert"><AlertCircle size={15} />{saveError}</div>}
                {hasRequiredPriceError && <div className="inline-message" role="alert"><AlertCircle size={15} />Target margin, sales commission and taxes must total less than 100% to calculate the required sale price.</div>}
              </section>
            </div>

            <div className="planner-view-host" id="planner-view-content">
              {selectedView === "waterfall" && (
                <section className="panel planner-waterfall" data-pack={selectedPack} aria-labelledby="planner-waterfall-heading">
                  <div className="planner-card-heading">
                    <div><div className="planner-section-caption"><span>05</span> COST BREAKDOWN</div><h2 id="planner-waterfall-heading">Cost waterfall</h2></div>
                    <span className="planner-pack-badge" data-pack={selectedPack}>{packDefinitions.find((pack) => pack.id === selectedPack)?.label}</span>
                  </div>
                  {selectedPresentation.waterfallSections.map((section) => (
                    <div className="planner-waterfall-section" key={section.id}>
                      <h3>{section.title}</h3>
                      {section.rows.map((row) => (
                        <div className={`planner-waterfall-row${row.id.endsWith("total") || row.id === "net-profit" ? " is-total" : ""}${row.isNegative ? " is-negative" : ""}`} key={row.id}>
                          <span className="planner-waterfall-label">{row.label}</span>
                          <strong className="planner-waterfall-amount">{formatCurrency(row.amount, currencyCode)}</strong>
                          <span className="planner-waterfall-percent">{formatPercent(row.percentOfReferencePrice)}</span>
                          {row.barWidthPercent !== null && <div className="planner-waterfall-track" aria-hidden="true"><span className="planner-waterfall-fill" style={{ width: `${row.barWidthPercent}%` }} /></div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              )}

              {selectedView === "outcomes" && (
                <div className="planner-view-stack">
                  <section className="panel planner-comparison" aria-labelledby="planner-comparison-heading">
                    <div className="planner-section-title"><div><div className="planner-section-caption"><span>05</span> PACK OUTCOMES</div><h2 id="planner-comparison-heading">All three pack outcomes</h2></div></div>
                    <div className="planner-comparison-grid">
                      {plannerPacks.map((pack) => (
                        <article className={`panel planner-comparison-card${pack.id === selectedPack ? " is-selected" : ""}`} data-pack={pack.id} key={pack.id}>
                          <div className="planner-comparison-heading"><div><div className="eyebrow">CONSTRUCTION COST</div><h3>{pack.label}</h3></div><strong>{formatCurrency(pack.packTotal.total, currencyCode)}</strong></div>
                          <div className="planner-comparison-values">
                            <div><span>Sale price used</span><strong>{formatCurrency(inputsForPack(engineInputs, pack.id).referenceSellingPrice, currencyCode)}</strong></div>
                            <div><span>Development cost</span><strong>{formatCurrency(pack.result.developmentCost, currencyCode)}</strong></div>
                            <div><span>Required sale price</span><strong>{pack.result.requiredSalePriceError ? "—" : formatCurrency(pack.result.requiredSalePrice, currencyCode)}</strong></div>
                            <div><span>Net profit</span><strong>{formatCurrency(pack.result.netProfit, currencyCode)}</strong></div>
                            <div><span>Net margin</span><strong>{formatPercent(pack.result.netMargin)}</strong></div>
                            <div><span>ROI</span><strong>{formatPercent(pack.result.roi)}</strong></div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="panel planner-house-type-comparison" aria-labelledby="planner-house-type-comparison-heading">
                    <div className="planner-section-title"><div><div className="planner-section-caption"><span>06</span> HOUSE TYPE COMPARISON</div><h2 id="planner-house-type-comparison-heading">Compare house types</h2></div></div>
                    <div className="planner-house-type-table-wrap">
                      <table className="planner-house-type-table">
                        <thead><tr><th scope="col">House type</th><th scope="col">Land</th><th scope="col">Standard</th><th scope="col">Eco</th><th scope="col">Premium</th></tr></thead>
                        <tbody>
                          {comparisonRows.map((row) => (
                            <tr className={row.id === selectedHouseTypeId ? "is-selected" : ""} key={row.id}>
                              <th scope="row"><div className="planner-house-type-name"><span>{row.name}</span>{row.costBasis === "Twin CSV (provisional)" && <span className="pill attention"><i />PROVISIONAL</span>}</div></th>
                              <td>{formatCurrency(row.land, currencyCode)}</td>
                              {packDefinitions.map(({ id }) => {
                                const metrics = row[id];
                                return <td key={id}><div className="planner-house-type-pack-metrics"><span><em>Net profit</em><strong>{formatCurrency(metrics.netProfit, currencyCode)}</strong></span><span><em>Net margin</em><strong>{formatPercent(metrics.netMargin)}</strong></span><span><em>ROI</em><strong>{formatPercent(metrics.roi)}</strong></span></div></td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {selectedView === "sale-prices" && (
                <section className="panel planner-sale-prices" aria-labelledby="planner-sale-prices-heading">
                  <div className="planner-sale-prices-header">
                    <div><div className="planner-section-caption"><span>05</span> REFERENCE VALUES</div><h2 id="planner-sale-prices-heading">Sale prices</h2><p>One house unit · keep a source note beside each reference.</p></div>
                    <span className="pill attention"><i />ASSUMPTION</span>
                  </div>
                  <form onSubmit={saveSalePrices}>
                    <div className="planner-sale-price-table-wrap">
                      <table className="planner-sale-price-table">
                        <thead><tr><th scope="col">House type</th>{packDefinitions.map(({ id, label }) => <th scope="col" key={id}>{label}</th>)}</tr></thead>
                        <tbody>
                          {salePriceMatrixRows.map(({ houseType, saved, salePrices, metrics }) => (
                            <tr key={houseType.id}>
                              <th scope="row"><span>{houseType.name}</span>{houseType.costBasis === "Twin CSV (provisional)" && <small>PROVISIONAL</small>}</th>
                              {packDefinitions.map(({ id, label }) => {
                                const cell = salePrices[id];
                                const dirty = salePriceCellIsDirty(cell, saved, id);
                                return (
                                  <td key={id}>
                                    <div className="planner-sale-price-cell">
                                      <label className="planner-sale-price-input-label"><span className="sr-only">{houseType.name} {label} sale price</span><span className="planner-sale-currency">{currencyCode === "EUR" ? "€" : currencyCode === "GBP" ? "£" : "$"}</span><input type="number" min="0" step="0.01" value={cell.price} onChange={(event) => updateSalePriceDraftCell(houseType.id, id, "price", event.target.value)} /></label>
                                      <label className="planner-sale-price-note-label"><span className="sr-only">{houseType.name} {label} price source note</span><input type="text" placeholder="Estimate, comparable sale, offer received" value={cell.note} onChange={(event) => updateSalePriceDraftCell(houseType.id, id, "note", event.target.value)} /></label>
                                      {dirty && <span className="planner-sale-price-unsaved">Unsaved</span>}
                                      <div className="planner-sale-price-metrics">
                                        <span>ROI<strong>{formatPercent(metrics[id].roi)}</strong>{houseType.costBasis === "Twin CSV (provisional)" && <span className="pill attention planner-provisional-roi"><i />PROVISIONAL</span>}</span>
                                        <span>Sale price / m²<strong>{formatCurrency(metrics[id].salePricePerSquareMeter, currencyCode)}</strong></span>
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
                    {salePriceNotice && <div className="inline-message" role="status"><Check size={15} />{salePriceNotice}</div>}
                    {salePriceSaveError && <div className="inline-message" role="alert"><AlertCircle size={15} />{salePriceSaveError}</div>}
                    <div className="form-actions planner-sale-price-actions"><button className="button button-primary" type="submit" disabled={updateSalePrices.isPending || dirtySalePriceRows.length === 0}><Save size={14} />{updateSalePrices.isPending ? "Saving…" : "Save sale prices"}</button></div>
                  </form>
                </section>
              )}
            </div>
          </div>

          <section className="panel planner-viability" data-pack={selectedPack} aria-labelledby="planner-viability-heading">
            <div className="planner-viability-copy">
              <div className="planner-section-caption"><span>{selectedView === "outcomes" ? "07" : "06"}</span> REFERENCE-PRICE VIABILITY</div>
              <h2 id="planner-viability-heading">{formatPercent(selectedResult.netMargin)} <span>net margin</span></h2>
              <p>Reference sale price · {formatCurrency(inputsForPack(engineInputs, selectedPack).referenceSellingPrice, currencyCode)}</p>
            </div>
            <div className="planner-viability-aside">
              <span>Net profit</span>
              <strong>{formatCurrency(selectedResult.netProfit, currencyCode)}</strong>
              <small>ROI {formatPercent(selectedResult.roi)}</small>
            </div>
            {selectedPresentation.viabilityScale && (
              <div className="planner-viability-chart">
                <div className="planner-viability-track" role="img" aria-label={`Target margin marker at ${formatPercent(selectedPresentation.viabilityScale.targetMargin)}`}>
                  {selectedPresentation.viabilityScale.targetPositionPercent !== null && <span className="planner-viability-marker is-target" style={{ left: `${selectedPresentation.viabilityScale.targetPositionPercent}%` }} />}
                </div>
                <div className="planner-viability-axis-labels">
                  {selectedPresentation.viabilityScale.targetPositionPercent !== null && <span style={{ left: `${selectedPresentation.viabilityScale.targetPositionPercent}%` }}>Target {formatPercent(selectedPresentation.viabilityScale.targetMargin)}</span>}
                </div>
              </div>
            )}
            <div className="planner-viability-warnings">
              {selectedPackTotal.pendingExtraCount > 0 && <div className="planner-assumption-warning"><AlertCircle size={14} />{selectedPackTotal.pendingExtraCount} extras pending a price</div>}
              <div className="planner-assumption-warning"><AlertCircle size={14} />Reference price is an assumption</div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
