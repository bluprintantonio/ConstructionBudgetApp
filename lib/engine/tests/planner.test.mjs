import assert from "node:assert/strict";
import test from "node:test";
import { calculatePlanner } from "../planner/index.ts";

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
