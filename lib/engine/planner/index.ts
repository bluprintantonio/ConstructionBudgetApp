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
