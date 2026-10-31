import assert from "node:assert/strict";
import test from "node:test";
import { calculateQuoteComparisons } from "../quotes/index.ts";

test("compares a quote with the sum of all linked Standard totals", () => {
  const comparisons = calculateQuoteComparisons(
    [
      {
        id: "quote-a",
        amount: 300,
        priceScope: "per house unit",
        scopeType: "installed",
        vatIncluded: "yes",
        validityDate: "2030-12-31",
      },
    ],
    [
      { quoteId: "quote-a", budgetLineCode: "1.1", extraId: null },
      { quoteId: "quote-a", budgetLineCode: "1.2", extraId: null },
    ],
    [
      { code: "1.1", standardTotal: 100 },
      { code: "1.2", standardTotal: 150 },
    ],
    "2030-01-01",
  );

  assert.equal(comparisons[0].csvTotal, 250);
  assert.equal(comparisons[0].difference, 50);
  assert.equal(comparisons[0].differencePercent, 20);
});

test("uses a negative difference and percentage when the quote is lower", () => {
  const [comparison] = calculateQuoteComparisons(
    [
      {
        id: "quote-b",
        amount: 80,
        priceScope: "per house unit",
        scopeType: "supplied",
        vatIncluded: "no",
        validityDate: null,
      },
    ],
    [{ quoteId: "quote-b", budgetLineCode: "2.1", extraId: null }],
    [{ code: "2.1", standardTotal: 100 }],
    "2030-01-01",
  );

  assert.equal(comparison.difference, -20);
  assert.equal(comparison.differencePercent, -20);
});

test("shows no percentage for zero or missing CSV totals", () => {
  const quotes = ["zero", "missing"].map((id) => ({
    id,
    amount: 25,
    priceScope: "per house unit",
    scopeType: "installed",
    vatIncluded: "yes",
    validityDate: null,
  }));
  const comparisons = calculateQuoteComparisons(
    quotes,
    [
      { quoteId: "zero", budgetLineCode: "3.1", extraId: null },
      { quoteId: "missing", budgetLineCode: "3.2", extraId: null },
    ],
    [
      { code: "3.1", standardTotal: 0 },
      { code: "3.2", standardTotal: null },
    ],
    "2030-01-01",
  );

  assert.equal(comparisons[0].difference, 25);
  assert.equal(comparisons[0].differencePercent, null);
  assert.equal(comparisons[1].csvTotal, null);
  assert.equal(comparisons[1].difference, null);
  assert.equal(comparisons[1].differencePercent, null);
});

test("warns on unknown scope/VAT and expired dates; marks lowest eligible quote only", () => {
  const comparisons = calculateQuoteComparisons(
    [
      {
        id: "lowest",
        amount: 90,
        priceScope: "per house unit",
        scopeType: "supplied",
        vatIncluded: "yes",
        validityDate: "2030-01-02",
      },
      {
        id: "unknown",
        amount: 80,
        priceScope: "per house unit",
        scopeType: "unknown",
        vatIncluded: "unknown",
        validityDate: "2030-01-02",
      },
      {
        id: "expired",
        amount: 70,
        priceScope: "per house unit",
        scopeType: "installed",
        vatIncluded: "yes",
        validityDate: "2029-12-31",
      },
    ],
    [
      { quoteId: "lowest", budgetLineCode: "4.1", extraId: null },
      { quoteId: "unknown", budgetLineCode: "4.1", extraId: null },
      { quoteId: "expired", budgetLineCode: "4.1", extraId: null },
    ],
    [{ code: "4.1", standardTotal: 100 }],
    "2030-01-01",
  );

  assert.equal(comparisons[0].lowest, true);
  assert.equal(comparisons[1].lowest, false);
  assert.deepEqual(comparisons[1].warnings, {
    scopeUnknown: true,
    vatUnknown: true,
    expired: false,
  });
  assert.equal(comparisons[2].warnings.expired, true);
  assert.equal(comparisons[2].lowest, false);
});
