import assert from "node:assert/strict";
import test from "node:test";
import { calculatePackTotals } from "../packs/index.ts";
import { materialMapRows } from "../../../artifacts/api-server/src/lib/material-map-data.ts";

test("Standard and Eco use Standard prices; the Eco price is ignored", () => {
  const totals = calculatePackTotals(
    [
      {
        quantity: 2,
        standardUnitPrice: 100,
        ecoUnitPrice: 1,
        premiumUnitPrice: 150,
        marker: "systems",
      },
    ],
    [],
  );

  assert.deepEqual(totals, {
    standard: {
      fromCsvLines: 200,
      fromCommonLines: null,
      fromPremiumRatedLines: null,
      notApplicableLineCount: null,
      notApplicableStandardValue: null,
      fromExtras: 0,
      total: 200,
      pendingExtraCount: 0,
    },
    eco: {
      fromCsvLines: 200,
      fromCommonLines: null,
      fromPremiumRatedLines: null,
      notApplicableLineCount: null,
      notApplicableStandardValue: null,
      fromExtras: 0,
      total: 200,
      pendingExtraCount: 0,
    },
    premium: {
      fromCsvLines: 300,
      fromCommonLines: 0,
      fromPremiumRatedLines: 300,
      notApplicableLineCount: 0,
      notApplicableStandardValue: 0,
      fromExtras: 0,
      total: 300,
      pendingExtraCount: 0,
    },
    premiumReconciliation: {
      csvPremiumTotal: 300,
      commonUpliftRemoved: 0,
      premiumLinesUsedByApp: 300,
      commonUpliftLines: [],
    },
  });
});

test("included extras are priced once for this house unit; pending items count", () => {
  const totals = calculatePackTotals(
    [
      { quantity: 3, standardUnitPrice: 20, premiumUnitPrice: 30, marker: "equipment" },
      { quantity: 1, standardUnitPrice: 0, premiumUnitPrice: 40, marker: "equipment" },
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
      fromCommonLines: null,
      fromPremiumRatedLines: null,
      notApplicableLineCount: null,
      notApplicableStandardValue: null,
      fromExtras: 0,
      total: 60,
      pendingExtraCount: 0,
    },
    eco: {
      fromCsvLines: 60,
      fromCommonLines: null,
      fromPremiumRatedLines: null,
      notApplicableLineCount: null,
      notApplicableStandardValue: null,
      fromExtras: 150,
      total: 210,
      pendingExtraCount: 0,
    },
    premium: {
      fromCsvLines: 130,
      fromCommonLines: 0,
      fromPremiumRatedLines: 130,
      notApplicableLineCount: 0,
      notApplicableStandardValue: 0,
      fromExtras: 150,
      total: 280,
      pendingExtraCount: 1,
    },
    premiumReconciliation: {
      csvPremiumTotal: 130,
      commonUpliftRemoved: 0,
      premiumLinesUsedByApp: 130,
      commonUpliftLines: [],
    },
  });
});

test("price status is a label; only blank prices count as pending", () => {
  const totals = calculatePackTotals(
    [{ quantity: 4, standardUnitPrice: 12, premiumUnitPrice: 25, marker: "finishings" }],
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
      {
        quantity: 3,
        inEco: true,
        inPremium: true,
        unitPrice: 5,
        priceStatus: "estimate",
      },
      {
        quantity: 1,
        inEco: true,
        inPremium: true,
        unitPrice: null,
        priceStatus: "estimate",
      },
    ],
  );

  assert.deepEqual(totals, {
    standard: {
      fromCsvLines: 48,
      fromCommonLines: null,
      fromPremiumRatedLines: null,
      notApplicableLineCount: null,
      notApplicableStandardValue: null,
      fromExtras: 0,
      total: 48,
      pendingExtraCount: 0,
    },
    eco: {
      fromCsvLines: 48,
      fromCommonLines: null,
      fromPremiumRatedLines: null,
      notApplicableLineCount: null,
      notApplicableStandardValue: null,
      fromExtras: 1014,
      total: 1062,
      pendingExtraCount: 1,
    },
    premium: {
      fromCsvLines: 100,
      fromCommonLines: 0,
      fromPremiumRatedLines: 100,
      notApplicableLineCount: 0,
      notApplicableStandardValue: 0,
      fromExtras: 35,
      total: 135,
      pendingExtraCount: 1,
    },
    premiumReconciliation: {
      csvPremiumTotal: 100,
      commonUpliftRemoved: 0,
      premiumLinesUsedByApp: 100,
      commonUpliftLines: [],
    },
  });
});

test("all common lines use Standard prices in Premium", () => {
  const totals = calculatePackTotals(
    [
      { quantity: 2, standardUnitPrice: 100, premiumUnitPrice: 150 },
      { quantity: 3, standardUnitPrice: 20, premiumUnitPrice: 30, marker: "common" },
    ],
    [],
  );

  assert.equal(totals.standard.total, 260);
  assert.equal(totals.premium.total, totals.standard.total);
  assert.equal(totals.premium.fromCommonLines, 260);
  assert.equal(totals.premium.fromPremiumRatedLines, 0);
});

test("one premium-rated line uses its Premium price; common line and extras stay separate", () => {
  const totals = calculatePackTotals(
    [
      { quantity: 2, standardUnitPrice: 10, premiumUnitPrice: 15 },
      { quantity: 3, standardUnitPrice: 20, premiumUnitPrice: 30, marker: "finishings" },
    ],
    [
      {
        quantity: 1,
        inEco: false,
        inPremium: true,
        unitPrice: 5,
        priceStatus: "quoted",
      },
    ],
  );

  assert.equal(totals.premium.fromCommonLines, 20);
  assert.equal(totals.premium.fromPremiumRatedLines, 90);
  assert.equal(totals.premium.fromExtras, 5);
  assert.equal(totals.premium.total, 115);
});

test("not-applicable line adds zero to Premium and its Standard value to Standard and Eco", () => {
  const totals = calculatePackTotals(
    [
      {
        quantity: 2,
        standardUnitPrice: 10,
        premiumUnitPrice: 15,
        marker: "not_applicable",
      },
    ],
    [],
  );

  assert.equal(totals.standard.total, 20);
  assert.equal(totals.eco.total, 20);
  assert.equal(totals.premium.total, 0);
  assert.equal(totals.premium.notApplicableLineCount, 1);
  assert.equal(totals.premium.notApplicableStandardValue, 20);
});

test("Premium reconciliation matches the hand-checked CSV, removed uplift, and app total", () => {
  const commonCodes = new Set([
    "0.1", "0.2", "0.3",
    "1.1", "1.2", "1.3", "1.4",
    "2.1", "2.2", "2.3", "2.4", "2.5", "2.6",
    "3.1", "3.2", "3.3",
    "10.1", "10.2", "10.4", "10.6",
    "11.1", "11.2", "11.3",
    "12.1", "12.2",
    "13.1", "13.3",
    "14.1", "14.3",
  ]);
  const notApplicableCodes = new Set(["10.3", "12.3"]);
  const lines = materialMapRows.map((line) => ({
    code: line.code,
    item: line.item,
    quantity: line.quantity,
    standardUnitPrice: line.standardUnitPrice,
    premiumUnitPrice: line.premiumUnitPrice,
    marker: notApplicableCodes.has(line.code)
      ? "not_applicable"
      : commonCodes.has(line.code)
        ? "common"
        : "systems",
  }));
  const totals = calculatePackTotals(lines, []);
  const reconciliation = totals.premiumReconciliation;

  assert.equal(reconciliation.csvPremiumTotal, 223_774);
  assert.equal(reconciliation.commonUpliftRemoved, 24_253);
  assert.equal(reconciliation.premiumLinesUsedByApp, 199_521);
  assert.equal(
    reconciliation.commonUpliftLines.reduce(
      (sum, line) => sum + line.difference,
      0,
    ),
    24_253,
  );
});

test("every different-priced CSV line Premium-rated reproduces the 223774 checksum", () => {
  const lines = materialMapRows.map((line) => ({
    quantity: line.quantity,
    standardUnitPrice: line.standardUnitPrice,
    premiumUnitPrice: line.premiumUnitPrice,
    marker:
      line.standardUnitPrice === line.premiumUnitPrice
        ? "common"
        : "systems",
  }));
  const totals = calculatePackTotals(lines, []);

  assert.equal(lines.length, 67);
  assert.equal(totals.standard.total, 153_251);
  assert.equal(totals.premium.total, 223_774);
});
