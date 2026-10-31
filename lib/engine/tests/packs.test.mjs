import assert from "node:assert/strict";
import test from "node:test";
import { calculatePackTotals } from "../packs/index.ts";

test("Standard and Eco use Standard prices; the Eco price is ignored", () => {
  const totals = calculatePackTotals(
    [
      {
        quantity: 2,
        standardUnitPrice: 100,
        ecoUnitPrice: 1,
        premiumUnitPrice: 150,
      },
    ],
    [],
  );

  assert.deepEqual(totals, {
    standard: {
      fromCsvLines: 200,
      fromExtras: 0,
      total: 200,
      pendingExtraCount: 0,
    },
    eco: {
      fromCsvLines: 200,
      fromExtras: 0,
      total: 200,
      pendingExtraCount: 0,
    },
    premium: {
      fromCsvLines: 300,
      fromExtras: 0,
      total: 300,
      pendingExtraCount: 0,
    },
  });
});

test("included extras are priced once for this house unit; pending items count", () => {
  const totals = calculatePackTotals(
    [
      { quantity: 3, standardUnitPrice: 20, premiumUnitPrice: 30 },
      { quantity: 1, standardUnitPrice: 0, premiumUnitPrice: 40 },
    ],
    [
      {
        quantity: 2,
        inEco: true,
        inPremium: true,
        unitPrice: 75,
        priceStatus: "quoted",
      },
      {
        quantity: 1,
        inEco: false,
        inPremium: true,
        unitPrice: null,
        priceStatus: "pending",
      },
    ],
  );

  assert.deepEqual(totals, {
    standard: {
      fromCsvLines: 60,
      fromExtras: 0,
      total: 60,
      pendingExtraCount: 0,
    },
    eco: {
      fromCsvLines: 60,
      fromExtras: 150,
      total: 210,
      pendingExtraCount: 0,
    },
    premium: {
      fromCsvLines: 130,
      fromExtras: 150,
      total: 280,
      pendingExtraCount: 1,
    },
  });
});

test("pending price contributes zero even if a value is present", () => {
  const totals = calculatePackTotals(
    [{ quantity: 4, standardUnitPrice: 12, premiumUnitPrice: 25 }],
    [
      {
        quantity: 1,
        inEco: true,
        inPremium: false,
        unitPrice: 999,
        priceStatus: "pending",
      },
      {
        quantity: 2,
        inEco: false,
        inPremium: true,
        unitPrice: 10,
        priceStatus: "quoted",
      },
    ],
  );

  assert.deepEqual(totals, {
    standard: {
      fromCsvLines: 48,
      fromExtras: 0,
      total: 48,
      pendingExtraCount: 0,
    },
    eco: {
      fromCsvLines: 48,
      fromExtras: 0,
      total: 48,
      pendingExtraCount: 1,
    },
    premium: {
      fromCsvLines: 100,
      fromExtras: 20,
      total: 120,
      pendingExtraCount: 0,
    },
  });
});
