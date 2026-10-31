export type PackBudgetLine = {
  quantity: number | null;
  standardUnitPrice: number | null;
  premiumUnitPrice: number | null;
};

export type PackExtra = {
  quantity: number;
  inEco: boolean;
  inPremium: boolean;
  unitPrice: number | null;
  priceStatus: string;
};

export type PackCost = {
  fromCsvLines: number;
  fromExtras: number;
  total: number;
  pendingExtraCount: number;
};

export type PackTotals = {
  standard: PackCost;
  eco: PackCost;
  premium: PackCost;
};

function csvLinesTotal(
  lines: readonly PackBudgetLine[],
  priceKey: "standardUnitPrice" | "premiumUnitPrice",
): number {
  return lines.reduce(
    (total, line) =>
      total + (line.quantity ?? 0) * (line[priceKey] ?? 0),
    0,
  );
}

function extraCosts(
  extras: readonly PackExtra[],
  isIncluded: (extra: PackExtra) => boolean,
): Pick<PackCost, "fromExtras" | "pendingExtraCount"> {
  return extras.reduce(
    (result, extra) => {
      if (!isIncluded(extra)) return result;
      if (extra.unitPrice == null || extra.priceStatus === "pending") {
        result.pendingExtraCount += 1;
        return result;
      }
      result.fromExtras += extra.quantity * extra.unitPrice;
      return result;
    },
    { fromExtras: 0, pendingExtraCount: 0 },
  );
}

function packCost(
  fromCsvLines: number,
  extras: Pick<PackCost, "fromExtras" | "pendingExtraCount">,
): PackCost {
  return {
    fromCsvLines,
    fromExtras: extras.fromExtras,
    total: fromCsvLines + extras.fromExtras,
    pendingExtraCount: extras.pendingExtraCount,
  };
}

export function calculatePackTotals(
  lines: readonly PackBudgetLine[],
  extras: readonly PackExtra[],
): PackTotals {
  const standardFromCsv = csvLinesTotal(lines, "standardUnitPrice");
  const premiumFromCsv = csvLinesTotal(lines, "premiumUnitPrice");
  const ecoExtras = extraCosts(extras, (extra) => extra.inEco);
  const premiumExtras = extraCosts(extras, (extra) => extra.inPremium);

  return {
    standard: packCost(standardFromCsv, {
      fromExtras: 0,
      pendingExtraCount: 0,
    }),
    eco: packCost(standardFromCsv, ecoExtras),
    premium: packCost(premiumFromCsv, premiumExtras),
  };
}
