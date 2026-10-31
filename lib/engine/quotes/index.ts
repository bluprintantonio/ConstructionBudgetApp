export type QuoteScopeType = "supplied" | "installed" | "unknown";
export type QuoteVatIncluded = "yes" | "no" | "unknown";

export type QuoteComparisonQuote = {
  id: string;
  amount: number | null;
  priceScope: string;
  scopeType: QuoteScopeType;
  vatIncluded: QuoteVatIncluded;
  validityDate: string | null;
};

export type QuoteComparisonLink = {
  quoteId: string;
  budgetLineCode: string | null;
  extraId: string | null;
};

export type QuoteComparisonLine = {
  code: string | null;
  standardTotal: number | null;
};

export type QuoteWarnings = {
  scopeUnknown: boolean;
  vatUnknown: boolean;
  expired: boolean;
};

export type QuoteComparison = {
  quoteId: string;
  budgetLineCodes: string[];
  extraIds: string[];
  csvTotal: number | null;
  difference: number | null;
  differencePercent: number | null;
  warnings: QuoteWarnings;
  lowest: boolean;
};

function comparisonGroupKey(
  budgetLineCodes: string[],
  extraIds: string[],
): string {
  return JSON.stringify([budgetLineCodes, extraIds]);
}

function linkedStandardTotal(
  codes: string[],
  lines: QuoteComparisonLine[],
): number | null {
  if (codes.length === 0) return null;

  let total = 0;
  for (const code of codes) {
    const matches = lines.filter((line) => line.code === code);
    if (matches.length === 0 || matches.some((line) => line.standardTotal == null)) {
      return null;
    }
    total += matches.reduce((sum, line) => sum + (line.standardTotal ?? 0), 0);
  }
  return total;
}

export function calculateQuoteComparisons(
  quotes: QuoteComparisonQuote[],
  links: QuoteComparisonLink[],
  lines: QuoteComparisonLine[],
  today: string,
): QuoteComparison[] {
  const linksByQuote = new Map<string, QuoteComparisonLink[]>();
  for (const link of links) {
    const quoteLinks = linksByQuote.get(link.quoteId) ?? [];
    quoteLinks.push(link);
    linksByQuote.set(link.quoteId, quoteLinks);
  }

  const comparisons = quotes.map((quote) => {
    const quoteLinks = linksByQuote.get(quote.id) ?? [];
    const budgetLineCodes = [
      ...new Set(
        quoteLinks
          .map((link) => link.budgetLineCode)
          .filter((code): code is string => code !== null),
      ),
    ].sort();
    const extraIds = [
      ...new Set(
        quoteLinks
          .map((link) => link.extraId)
          .filter((id): id is string => id !== null),
      ),
    ].sort();
    const csvTotal = linkedStandardTotal(budgetLineCodes, lines);
    const difference =
      csvTotal !== null && quote.amount !== null
        ? quote.amount - csvTotal
        : null;
    const differencePercent =
      difference !== null && csvTotal !== null && csvTotal !== 0
        ? (difference / csvTotal) * 100
        : null;

    return {
      quoteId: quote.id,
      budgetLineCodes,
      extraIds,
      csvTotal,
      difference,
      differencePercent,
      warnings: {
        scopeUnknown: quote.scopeType === "unknown",
        vatUnknown: quote.vatIncluded === "unknown",
        expired: quote.validityDate !== null && quote.validityDate < today,
      },
      lowest: false,
    };
  });

  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const groups = new Map<string, QuoteComparison[]>();
  for (const comparison of comparisons) {
    if (
      comparison.budgetLineCodes.length === 0 &&
      comparison.extraIds.length === 0
    ) {
      continue;
    }
    const key = comparisonGroupKey(
      comparison.budgetLineCodes,
      comparison.extraIds,
    );
    const group = groups.get(key) ?? [];
    group.push(comparison);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const candidates = group.filter((comparison) => {
      const quote = quoteById.get(comparison.quoteId);
      return (
        quote?.amount !== null &&
        quote?.amount !== undefined &&
        !comparison.warnings.expired &&
        !comparison.warnings.scopeUnknown
      );
    });
    if (candidates.length === 0) continue;
    const lowestAmount = Math.min(
      ...candidates.map((comparison) => quoteById.get(comparison.quoteId)!.amount!),
    );
    for (const comparison of candidates) {
      if (quoteById.get(comparison.quoteId)?.amount === lowestAmount) {
        comparison.lowest = true;
      }
    }
  }

  return comparisons;
}
