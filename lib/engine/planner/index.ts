export type PlannerInputs = {
  grossArea: number | null;
  land: number | null;
  designLicensing: number | null;
  managementPercent: number | null;
  contingencyPercent: number | null;
  targetNetMarginPercent: number | null;
  salesCommissionPercent: number | null;
  taxesPercent: number | null;
  referenceSellingPrice: number | null;
};

export type PlannerPackId = "standard" | "eco" | "premium";

export type HouseTypePlannerInputs = Omit<
  PlannerInputs,
  "referenceSellingPrice"
> & {
  standardReferenceSellingPrice: number | null;
  ecoReferenceSellingPrice: number | null;
  premiumReferenceSellingPrice: number | null;
};

export type PlannerPackTotals = Record<PlannerPackId, number>;

export type HouseTypeComparisonInput = {
  id: string;
  name: string;
  costBasis: string;
  inputs: HouseTypePlannerInputs | null;
};

export type HouseTypeComparisonPack = Pick<
  PlannerPackResult,
  "netProfit" | "netMargin" | "roi"
>;

export type HouseTypeComparisonRow = {
  id: string;
  name: string;
  costBasis: string;
  land: number | null;
  standard: HouseTypeComparisonPack;
  eco: HouseTypeComparisonPack;
  premium: HouseTypeComparisonPack;
};

export type PlannerPackResult = {
  managementFee: number | null;
  indirectCosts: number | null;
  contingency: number | null;
  developmentCost: number | null;
  requiredSalePrice: number | null;
  requiredSalePriceError: boolean;
  netProfit: number | null;
  netMargin: number | null;
  roi: number | null;
  viable: boolean | null;
  costPerSquareMeter: number | null;
};

export type PlannerConstructionBreakdown = {
  constructionCost: number;
  csvLines: number;
  premiumRatedLines: number | null;
  extras: number;
};

export type PlannerWaterfallRow = {
  id: string;
  label: string;
  amount: number | null;
  percentOfReferencePrice: number | null;
  barWidthPercent: number | null;
  isNegative: boolean | null;
};

export type PlannerWaterfallSection = {
  id: string;
  title: string;
  rows: PlannerWaterfallRow[];
};

export type PlannerViabilityScale = {
  zeroPositionPercent: number;
  targetMargin: number | null;
  targetPositionPercent: number | null;
  currentPositionPercent: number | null;
  fillStartPercent: number | null;
  fillWidthPercent: number | null;
  currentIsPositive: boolean | null;
};

export type PlannerPresentation = {
  requiredSalePricePerSquareMeter: number | null;
  grossProfit: number | null;
  commissionAtReferencePrice: number | null;
  taxesAtReferencePrice: number | null;
  waterfallSections: PlannerWaterfallSection[];
  viabilityScale: PlannerViabilityScale | null;
};

function ratio(percent: number | null): number | null {
  return percent === null ? null : percent / 100;
}

export function calculatePlanner(
  packTotal: number,
  inputs: PlannerInputs,
): PlannerPackResult {
  const managementRate = ratio(inputs.managementPercent);
  const contingencyRate = ratio(inputs.contingencyPercent);
  const marginRate = ratio(inputs.targetNetMarginPercent);
  const commissionRate = ratio(inputs.salesCommissionPercent);
  const taxRate = ratio(inputs.taxesPercent);

  const managementFee =
    managementRate === null ? null : packTotal * managementRate;
  const indirectCosts =
    inputs.land === null ||
    inputs.designLicensing === null ||
    managementFee === null
      ? null
      : inputs.land + inputs.designLicensing + managementFee;
  const contingency =
    contingencyRate === null ? null : packTotal * contingencyRate;
  const developmentCost =
    indirectCosts === null || contingency === null
      ? null
      : packTotal + indirectCosts + contingency;

  const requiredRatesReady =
    marginRate !== null && commissionRate !== null && taxRate !== null;
  const combinedRate =
    requiredRatesReady
      ? marginRate + commissionRate + taxRate
      : null;
  const requiredSalePriceError =
    combinedRate !== null && combinedRate >= 1;
  const requiredSalePrice =
    developmentCost === null ||
    combinedRate === null ||
    requiredSalePriceError
      ? null
      : developmentCost / (1 - combinedRate);

  const netProfit =
    developmentCost === null ||
    inputs.referenceSellingPrice === null ||
    commissionRate === null ||
    taxRate === null
      ? null
      : inputs.referenceSellingPrice -
        developmentCost -
        inputs.referenceSellingPrice * commissionRate -
        inputs.referenceSellingPrice * taxRate;
  const netMargin =
    netProfit === null ||
    inputs.referenceSellingPrice === null ||
    inputs.referenceSellingPrice === 0
      ? null
      : netProfit / inputs.referenceSellingPrice;
  const roi =
    netProfit === null ||
    developmentCost === null ||
    developmentCost === 0
      ? null
      : netProfit / developmentCost;
  const costPerSquareMeter =
    developmentCost === null ||
    inputs.grossArea === null ||
    inputs.grossArea === 0
      ? null
      : developmentCost / inputs.grossArea;

  return {
    managementFee,
    indirectCosts,
    contingency,
    developmentCost,
    requiredSalePrice,
    requiredSalePriceError,
    netProfit,
    netMargin,
    roi,
    viable: netProfit === null ? null : netProfit > 0,
    costPerSquareMeter,
  };
}

export function inputsForPack(
  inputs: HouseTypePlannerInputs,
  pack: PlannerPackId,
): PlannerInputs {
  const referenceSellingPrice = {
    standard: inputs.standardReferenceSellingPrice,
    eco: inputs.ecoReferenceSellingPrice,
    premium: inputs.premiumReferenceSellingPrice,
  }[pack];

  return { ...inputs, referenceSellingPrice };
}

export function calculatePlannerPackResults(
  packTotals: PlannerPackTotals,
  inputs: HouseTypePlannerInputs,
): Record<PlannerPackId, PlannerPackResult> {
  return {
    standard: calculatePlanner(
      packTotals.standard,
      inputsForPack(inputs, "standard"),
    ),
    eco: calculatePlanner(packTotals.eco, inputsForPack(inputs, "eco")),
    premium: calculatePlanner(
      packTotals.premium,
      inputsForPack(inputs, "premium"),
    ),
  };
}

export function calculateHouseTypeComparisonRows(
  packTotals: PlannerPackTotals,
  houseTypes: HouseTypeComparisonInput[],
): HouseTypeComparisonRow[] {
  return houseTypes.map((houseType) => {
    if (houseType.inputs === null) {
      const blankMetrics = { netProfit: null, netMargin: null, roi: null };
      return {
        id: houseType.id,
        name: houseType.name,
        costBasis: houseType.costBasis,
        land: null,
        standard: blankMetrics,
        eco: blankMetrics,
        premium: blankMetrics,
      };
    }

    const results = calculatePlannerPackResults(packTotals, houseType.inputs);
    return {
      id: houseType.id,
      name: houseType.name,
      costBasis: houseType.costBasis,
      land: houseType.inputs.land,
      standard: {
        netProfit: results.standard.netProfit,
        netMargin: results.standard.netMargin,
        roi: results.standard.roi,
      },
      eco: {
        netProfit: results.eco.netProfit,
        netMargin: results.eco.netMargin,
        roi: results.eco.roi,
      },
      premium: {
        netProfit: results.premium.netProfit,
        netMargin: results.premium.netMargin,
        roi: results.premium.roi,
      },
    };
  });
}

function waterfallRow(
  id: string,
  label: string,
  amount: number | null,
  referencePrice: number | null,
): PlannerWaterfallRow {
  const percentOfReferencePrice =
    amount === null || referencePrice === null || referencePrice === 0
      ? null
      : amount / referencePrice;

  return {
    id,
    label,
    amount,
    percentOfReferencePrice,
    barWidthPercent:
      percentOfReferencePrice === null
        ? null
        : Math.min(Math.abs(percentOfReferencePrice) * 100, 100),
    isNegative: amount === null ? null : amount < 0,
  };
}

function viabilityScale(
  referencePrice: number | null,
  currentMargin: number | null,
  targetMargin: number | null,
): PlannerViabilityScale | null {
  if (referencePrice === null || referencePrice === 0) return null;

  const margins = [0];
  if (currentMargin !== null) margins.push(currentMargin);
  if (targetMargin !== null) margins.push(targetMargin);
  const low = Math.min(...margins);
  const high = Math.max(...margins);
  const span = high - low;
  const padding = span === 0 ? Math.max(Math.abs(high) * 0.1, 0.01) : span * 0.1;
  const min = low - padding;
  const max = high + padding;
  const position = (value: number) =>
    Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const zeroPositionPercent = position(0);
  const currentPositionPercent =
    currentMargin === null ? null : position(currentMargin);

  return {
    zeroPositionPercent,
    targetMargin,
    targetPositionPercent:
      targetMargin === null ? null : position(targetMargin),
    currentPositionPercent,
    fillStartPercent:
      currentPositionPercent === null
        ? null
        : Math.min(zeroPositionPercent, currentPositionPercent),
    fillWidthPercent:
      currentPositionPercent === null
        ? null
        : Math.abs(currentPositionPercent - zeroPositionPercent),
    currentIsPositive: currentMargin === null ? null : currentMargin >= 0,
  };
}

export function calculatePlannerPresentation(
  result: PlannerPackResult,
  inputs: PlannerInputs,
  construction: PlannerConstructionBreakdown,
): PlannerPresentation {
  const referencePrice = inputs.referenceSellingPrice;
  const commissionRate = ratio(inputs.salesCommissionPercent);
  const taxRate = ratio(inputs.taxesPercent);
  const commissionAtReferencePrice =
    referencePrice === null || commissionRate === null
      ? null
      : referencePrice * commissionRate;
  const taxesAtReferencePrice =
    referencePrice === null || taxRate === null
      ? null
      : referencePrice * taxRate;
  const grossProfit =
    referencePrice === null || result.developmentCost === null
      ? null
      : referencePrice - result.developmentCost;
  const targetMargin = ratio(inputs.targetNetMarginPercent);
  const constructionRows = [
    waterfallRow("csv-lines", "CSV lines", construction.csvLines, referencePrice),
  ];

  if (construction.premiumRatedLines !== null) {
    constructionRows.push(
      waterfallRow(
        "premium-rated-lines",
        "Premium-rated lines",
        construction.premiumRatedLines,
        referencePrice,
      ),
    );
  }
  constructionRows.push(
    waterfallRow("extras", "Extras", construction.extras, referencePrice),
    waterfallRow(
      "construction-total",
      "Construction cost total",
      construction.constructionCost,
      referencePrice,
    ),
  );

  return {
    requiredSalePricePerSquareMeter:
      result.requiredSalePrice === null ||
      inputs.grossArea === null ||
      inputs.grossArea === 0
        ? null
        : result.requiredSalePrice / inputs.grossArea,
    grossProfit,
    commissionAtReferencePrice,
    taxesAtReferencePrice,
    waterfallSections: [
      {
        id: "construction",
        title: "Construction cost",
        rows: constructionRows,
      },
      {
        id: "development",
        title: "Development cost",
        rows: [
          waterfallRow("land", "Land", inputs.land, referencePrice),
          waterfallRow(
            "design-licensing",
            "Design/licensing",
            inputs.designLicensing,
            referencePrice,
          ),
          waterfallRow(
            "management-fee",
            "Management fee",
            result.managementFee,
            referencePrice,
          ),
          waterfallRow(
            "contingency",
            "Contingency",
            result.contingency,
            referencePrice,
          ),
          waterfallRow(
            "development-cost-total",
            "Development cost total",
            result.developmentCost,
            referencePrice,
          ),
        ],
      },
      {
        id: "reference-price",
        title: "At the reference price",
        rows: [
          waterfallRow("gross-profit", "Gross profit", grossProfit, referencePrice),
          waterfallRow(
            "commission",
            "Commission",
            commissionAtReferencePrice === null
              ? null
              : -commissionAtReferencePrice,
            referencePrice,
          ),
          waterfallRow(
            "taxes",
            "Taxes",
            taxesAtReferencePrice === null ? null : -taxesAtReferencePrice,
            referencePrice,
          ),
          waterfallRow("net-profit", "NET PROFIT", result.netProfit, referencePrice),
        ],
      },
    ],
    viabilityScale: viabilityScale(
      referencePrice,
      result.netMargin,
      targetMargin,
    ),
  };
}
