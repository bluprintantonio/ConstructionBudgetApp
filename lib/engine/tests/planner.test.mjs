import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePlanner,
  calculatePremiumPlanner,
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
    premiumAdjustmentPct: null,
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
    premiumAdjustmentPct: null,
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

test("blank Premium adjustment and non-Premium packs preserve the original total", () => {
  const inputs = {
    grossArea: 100,
    land: 0,
    designLicensing: 0,
    managementPercent: 0,
    contingencyPercent: 0,
    targetNetMarginPercent: 0,
    salesCommissionPercent: 0,
    taxesPercent: 0,
    referenceSellingPrice: 200,
    premiumAdjustmentPct: null,
  };

  const result = calculatePremiumPlanner(100, 25, inputs);
  const unchanged = calculatePlanner(125, inputs);
  const nonPremium = calculatePlanner(125, {
    ...inputs,
    premiumAdjustmentPct: -10,
  });

  assert.deepEqual(result, unchanged);
  assert.deepEqual(nonPremium, unchanged);
  assert.equal(result.developmentCost, 125);
});

test("-10% Premium adjustment changes CSV lines only before Planner formulas", () => {
  const result = calculatePremiumPlanner(100_000, 20_000, {
    grossArea: 100,
    land: 10_000,
    designLicensing: 5_000,
    managementPercent: 10,
    contingencyPercent: 10,
    targetNetMarginPercent: 20,
    salesCommissionPercent: 5,
    taxesPercent: 5,
    referenceSellingPrice: 200_000,
    premiumAdjustmentPct: -10,
  });

  assert.deepEqual(result, {
    managementFee: 11_000,
    indirectCosts: 26_000,
    contingency: 11_000,
    developmentCost: 147_000,
    requiredSalePrice: 210_000,
    requiredSalePriceError: false,
    netProfit: 33_000,
    netMargin: 0.165,
    roi: 33_000 / 147_000,
    viable: true,
    costPerSquareMeter: 1_470,
  });
});
