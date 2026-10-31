import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateHouseTypeComparisonRows,
  calculatePlanner,
  calculatePlannerPackResults,
  calculatePlannerPresentation,
  calculateSalePriceMetrics,
} from "../planner/index.ts";

test("development cost, required price, profit, margin, ROI, viability, and €/m²", () => {
  const result = calculatePlanner(100_000, {
    grossArea: 100,
    land: 50_000,
    designLicensing: 10_000,
    managementPercent: 10,
    contingencyPercent: 5,
    targetNetMarginPercent: 20,
    salesCommissionPercent: 3,
    taxesPercent: 2,
    referenceSellingPrice: 200_000,
  });

  assert.deepEqual(result, {
    managementFee: 10_000,
    indirectCosts: 70_000,
    contingency: 5_000,
    developmentCost: 175_000,
    requiredSalePrice: 233_333.33333333334,
    requiredSalePriceError: false,
    netProfit: 15_000,
    netMargin: 0.075,
    roi: 0.08571428571428572,
    viable: true,
    costPerSquareMeter: 1_750,
  });
});

test("second hand calculation and 100% required-price guard", () => {
  const inputs = {
    grossArea: 80,
    land: 20_000,
    designLicensing: 5_000,
    managementPercent: 5,
    contingencyPercent: 10,
    targetNetMarginPercent: 30,
    salesCommissionPercent: 5,
    taxesPercent: 5,
    referenceSellingPrice: 150_000,
  };
  const result = calculatePlanner(80_000, inputs);

  assert.deepEqual({ ...result, requiredSalePrice: null }, {
    managementFee: 4_000,
    indirectCosts: 29_000,
    contingency: 8_000,
    developmentCost: 117_000,
    requiredSalePrice: null,
    requiredSalePriceError: false,
    netProfit: 18_000,
    netMargin: 0.12,
    roi: 0.15384615384615385,
    viable: true,
    costPerSquareMeter: 1_462.5,
  });
  assert.ok(Math.abs(result.requiredSalePrice - 195_000) < 1e-9);

  const guarded = calculatePlanner(80_000, {
    ...inputs,
    targetNetMarginPercent: 90,
  });
  assert.equal(guarded.requiredSalePrice, null);
  assert.equal(guarded.requiredSalePriceError, true);
});

test("hand-checked planner presentation and reference-price waterfall", () => {
  const inputs = {
    grossArea: 100,
    land: 75_000,
    designLicensing: 25_000,
    managementPercent: 5,
    contingencyPercent: 7,
    targetNetMarginPercent: 20,
    salesCommissionPercent: 3,
    taxesPercent: 2,
    referenceSellingPrice: 400_000,
  };
  const result = calculatePlanner(128_651.83, inputs);
  const presentation = calculatePlannerPresentation(result, inputs, {
    constructionCost: 128_651.83,
    csvLines: 128_651.83,
    premiumRatedLines: null,
    extras: 0,
  });
  const rows = presentation.waterfallSections.flatMap((section) => section.rows);
  const row = (id) => rows.find((candidate) => candidate.id === id);

  assert.ok(Math.abs(result.developmentCost - 244_090.0496) < 1e-8);
  assert.ok(Math.abs(presentation.grossProfit - 155_909.9504) < 1e-8);
  assert.equal(presentation.commissionAtReferencePrice, 12_000);
  assert.equal(presentation.taxesAtReferencePrice, 8_000);
  assert.ok(Math.abs(result.netProfit - 135_909.9504) < 1e-8);
  assert.equal(Number((result.netMargin * 100).toFixed(2)), 33.98);
  assert.equal(Number((result.roi * 100).toFixed(2)), 55.68);
  assert.ok(
    Math.abs(
      presentation.requiredSalePricePerSquareMeter -
        result.requiredSalePrice / 100,
    ) < 1e-9,
  );
  assert.ok(Math.abs(row("construction-total").percentOfReferencePrice - 0.321629575) < 1e-10);
  assert.equal(row("commission").amount, -12_000);
  assert.equal(row("taxes").amount, -8_000);
  assert.ok(
    Math.abs(row("net-profit").percentOfReferencePrice - result.netProfit / 400_000) <
      1e-12,
  );
  assert.equal(presentation.viabilityScale.targetMargin, 0.2);
});

test("reference-price bars are absent when the reference price is blank", () => {
  const inputs = {
    grossArea: null,
    land: null,
    designLicensing: null,
    managementPercent: null,
    contingencyPercent: null,
    targetNetMarginPercent: null,
    salesCommissionPercent: null,
    taxesPercent: null,
    referenceSellingPrice: null,
  };
  const result = calculatePlanner(10_000, inputs);
  const presentation = calculatePlannerPresentation(result, inputs, {
    constructionCost: 10_000,
    csvLines: 10_000,
    premiumRatedLines: null,
    extras: 0,
  });

  assert.equal(presentation.viabilityScale, null);
  assert.ok(
    presentation.waterfallSections
      .flatMap((section) => section.rows)
      .every(
        (row) =>
          row.percentOfReferencePrice === null && row.barWidthPercent === null,
      ),
  );
});

test("raising land by 10,000 raises each pack cost without changing pack totals", () => {
  const packTotals = {
    standard: 100_000,
    eco: 110_000,
    premium: 120_000,
  };
  const originalPackTotals = { ...packTotals };
  const inputs = {
    grossArea: 100,
    land: 20_000,
    designLicensing: 10_000,
    managementPercent: 5,
    contingencyPercent: 5,
    targetNetMarginPercent: 20,
    salesCommissionPercent: 3,
    taxesPercent: 2,
    standardReferenceSellingPrice: 200_000,
    ecoReferenceSellingPrice: 210_000,
    premiumReferenceSellingPrice: 220_000,
  };
  const before = calculatePlannerPackResults(packTotals, inputs);
  const after = calculatePlannerPackResults(packTotals, {
    ...inputs,
    land: inputs.land + 10_000,
  });

  for (const pack of ["standard", "eco", "premium"]) {
    assert.equal(after[pack].developmentCost - before[pack].developmentCost, 10_000);
  }
  assert.deepEqual(packTotals, originalPackTotals);
});

test("house-type comparison uses each pack reference price and leaves unsaved types blank", () => {
  const rows = calculateHouseTypeComparisonRows(
    { standard: 100_000, eco: 110_000, premium: 120_000 },
    [
      {
        id: "twin-villa",
        name: "Twin villa",
        costBasis: "Twin CSV",
        inputs: {
          grossArea: 100,
          land: 50_000,
          designLicensing: 10_000,
          managementPercent: 10,
          contingencyPercent: 5,
          targetNetMarginPercent: 20,
          salesCommissionPercent: 3,
          taxesPercent: 2,
          standardReferenceSellingPrice: 200_000,
          ecoReferenceSellingPrice: 210_000,
          premiumReferenceSellingPrice: 220_000,
        },
      },
      {
        id: "townhouse",
        name: "Townhouse",
        costBasis: "Twin CSV (provisional)",
        inputs: null,
      },
    ],
  );

  assert.deepEqual(rows[0], {
    id: "twin-villa",
    name: "Twin villa",
    costBasis: "Twin CSV",
    land: 50_000,
    standard: { netProfit: 15_000, netMargin: 0.075, roi: 15000 / 175000 },
    eco: { netProfit: 13_000, netMargin: 13000 / 210000, roi: 13000 / 186500 },
    premium: { netProfit: 11_000, netMargin: 0.05, roi: 11000 / 198000 },
  });
  assert.deepEqual(rows[1], {
    id: "townhouse",
    name: "Townhouse",
    costBasis: "Twin CSV (provisional)",
    land: null,
    standard: { netProfit: null, netMargin: null, roi: null },
    eco: { netProfit: null, netMargin: null, roi: null },
    premium: { netProfit: null, netMargin: null, roi: null },
  });
});

test("changing Bungalow Premium sale price only changes that comparison cell", () => {
  const packTotals = {
    standard: 284_706.14,
    eco: 287_556.14,
    premium: 349_423.94,
  };
  const makeInputs = () => ({
    grossArea: 100,
    land: 0,
    designLicensing: 0,
    managementPercent: 0,
    contingencyPercent: 0,
    targetNetMarginPercent: 0,
    salesCommissionPercent: 9,
    taxesPercent: 0,
    standardReferenceSellingPrice: 400_000,
    ecoReferenceSellingPrice: 410_000,
    premiumReferenceSellingPrice: 490_000,
  });
  const houseTypes = [
    { id: "twin-villa", name: "Twin villa", costBasis: "Twin CSV", inputs: makeInputs() },
    { id: "townhouse", name: "Townhouse", costBasis: "Twin CSV (provisional)", inputs: makeInputs() },
    { id: "bungalow", name: "Bungalow", costBasis: "Twin CSV (provisional)", inputs: makeInputs() },
  ];
  const before = calculateHouseTypeComparisonRows(packTotals, houseTypes);
  const after = calculateHouseTypeComparisonRows(
    packTotals,
    houseTypes.map((houseType) =>
      houseType.id === "bungalow"
        ? {
            ...houseType,
            inputs: {
              ...houseType.inputs,
              premiumReferenceSellingPrice: 500_000,
            },
          }
        : houseType,
    ),
  );

  for (const typeId of ["twin-villa", "townhouse"]) {
    assert.deepEqual(after.find((row) => row.id === typeId), before.find((row) => row.id === typeId));
  }
  const bungalowBefore = before.find((row) => row.id === "bungalow");
  const bungalowAfter = after.find((row) => row.id === "bungalow");
  assert.deepEqual(bungalowAfter.standard, bungalowBefore.standard);
  assert.deepEqual(bungalowAfter.eco, bungalowBefore.eco);
  assert.notDeepEqual(bungalowAfter.premium, bungalowBefore.premium);
  assert.equal(bungalowBefore.premium.roi, (490_000 - 349_423.94 - 490_000 * 0.09) / 349_423.94);
  assert.equal(bungalowAfter.premium.roi, (500_000 - 349_423.94 - 500_000 * 0.09) / 349_423.94);
});

test("sale price metrics match the supplied hand calculation", () => {
  const packTotals = [284_706.14, 287_556.14, 349_423.94];
  const salePrices = [400_000, 410_000, 490_000];
  const expectedProfit = [79_293.86, 85_943.86, 95_576.06];
  const expectedRoiPercent = [27.85, 29.89, 27.35];
  const packs = ["standard", "eco", "premium"];
  const inputs = {
    grossArea: 100,
    land: 0,
    designLicensing: 0,
    managementPercent: 0,
    contingencyPercent: 0,
    targetNetMarginPercent: 0,
    salesCommissionPercent: 9,
    taxesPercent: 0,
    standardReferenceSellingPrice: salePrices[0],
    ecoReferenceSellingPrice: salePrices[1],
    premiumReferenceSellingPrice: salePrices[2],
  };

  for (let index = 0; index < packs.length; index += 1) {
    const metrics = calculateSalePriceMetrics(
      packTotals[index],
      inputs,
      packs[index],
      salePrices[index],
    );
    const expectedRoi = expectedProfit[index] / packTotals[index];
    assert.ok(Math.abs((salePrices[index] - packTotals[index] - salePrices[index] * 0.09) - expectedProfit[index]) < 0.01);
    assert.ok(Math.abs(metrics.roi - expectedRoi) < 1e-12);
    assert.equal(Number((metrics.roi * 100).toFixed(2)), expectedRoiPercent[index]);
    assert.equal(metrics.salePricePerSquareMeter, salePrices[index] / 100);
  }
});
