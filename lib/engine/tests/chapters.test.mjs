import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateChapterGroups,
  getEffectiveChapter,
} from "../chapters/index.ts";
import { calculatePackTotals } from "../packs/index.ts";

const chapters = [
  {
    code: "CAP. 7",
    name: "Carpintarias",
    sortOrder: 0,
    kind: "original",
    specReference: "CAP_09",
  },
  {
    code: "CAP. 16",
    name: "Caixilharias e Vidros",
    sortOrder: 1,
    kind: "added",
    specReference: "CAP_08",
  },
];

const lines = [
  {
    code: "7.1",
    category: "CAP. 7 Carpintarias",
    quantity: 1,
    standardUnitPrice: 100,
    ecoUnitPrice: 80,
    premiumUnitPrice: 150,
    marker: "finishings",
  },
  {
    code: "7.2",
    category: "CAP. 7 Carpintarias",
    quantity: 2,
    standardUnitPrice: 10,
    ecoUnitPrice: 7,
    premiumUnitPrice: 15,
    marker: "common",
  },
  {
    code: "7.3",
    category: "CAP. 7 Carpintarias",
    quantity: 3,
    standardUnitPrice: 4,
    ecoUnitPrice: 2,
    premiumUnitPrice: 8,
    marker: "not_applicable",
  },
];

test("moving a line changes the two chapter totals without changing pack totals", () => {
  const { groups: before } = calculateChapterGroups(lines, chapters, []);
  const { groups: after } = calculateChapterGroups(
    lines,
    chapters,
    [{ budgetLineCode: "7.1", chapterCode: "CAP. 16", reason: "approved move" }],
  );
  const beforeCarpentry = before.find((group) => group.code === "CAP. 7");
  const afterCarpentry = after.find((group) => group.code === "CAP. 7");
  const afterGlazing = after.find((group) => group.code === "CAP. 16");

  assert.equal(beforeCarpentry?.totals.standard.total, 132);
  assert.equal(beforeCarpentry?.totals.premium.total, 170);
  assert.equal(afterCarpentry?.totals.standard.total, 32);
  assert.equal(afterCarpentry?.totals.premium.total, 20);
  assert.equal(afterGlazing?.totals.standard.total, 100);
  assert.equal(afterGlazing?.totals.premium.total, 150);

  const wholePack = calculatePackTotals(lines, []);
  for (const pack of ["standard", "eco", "premium"]) {
    const beforeSum = before.reduce(
      (sum, group) => sum + group.totals[pack].total,
      0,
    );
    const afterSum = after.reduce(
      (sum, group) => sum + group.totals[pack].total,
      0,
    );
    assert.equal(beforeSum, wholePack[pack].total);
    assert.equal(afterSum, wholePack[pack].total);
  }
});

test("removing an override restores the source CSV chapter", () => {
  const overridden = getEffectiveChapter(
    lines[0],
    chapters,
    [{ budgetLineCode: "7.1", chapterCode: "CAP. 16", reason: "approved move" }],
  );
  const restored = getEffectiveChapter(lines[0], chapters, []);

  assert.equal(overridden.code, "CAP. 16");
  assert.equal(overridden.isOverridden, true);
  assert.equal(restored.code, "CAP. 7");
  assert.equal(restored.isOverridden, false);
  assert.equal(restored.sourceChapterCode, "CAP. 7");
});

test("chapter totals sum to each pack total with no extra prices", () => {
  const { groups } = calculateChapterGroups(
    lines,
    chapters,
    [{ budgetLineCode: "7.1", chapterCode: "CAP. 16", reason: "approved move" }],
  );
  const wholePack = calculatePackTotals(lines, []);

  for (const pack of ["standard", "eco", "premium"]) {
    const chapterSum = groups.reduce(
      (sum, group) => sum + group.totals[pack].total,
      0,
    );
    assert.equal(chapterSum, wholePack[pack].total);
  }
});

test("overrides arriving before chapters remain loading without grouping or totals", () => {
  const overrides = [{ budgetLineCode: "7.1", chapterCode: "CAP. 16", reason: "approved move" }];
  const loading = calculateChapterGroups(lines, undefined, overrides);
  assert.deepEqual(loading, { ready: false, groups: [], warnings: [] });
  assert.equal(calculateChapterGroups(lines, chapters, undefined).ready, false);
  assert.equal(calculateChapterGroups(lines, chapters, overrides).ready, true);
});

test("an unknown override warns and keeps the CSV chapter and unchanged totals", () => {
  const overrides = [{ budgetLineCode: "7.1", chapterCode: "CAP. 17", reason: "missing chapter" }];
  const effective = getEffectiveChapter(lines[0], chapters, overrides);
  assert.equal(effective.code, "CAP. 7");
  assert.equal(effective.isOverridden, false);
  assert.equal(effective.warning?.message, "override for line 7.1 points to unknown chapter CAP. 17");
  const result = calculateChapterGroups(lines, chapters, overrides);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(result.groups, calculateChapterGroups(lines, chapters, []).groups);
  const wholePack = calculatePackTotals(lines, []);
  for (const pack of ["standard", "eco", "premium"]) {
    assert.equal(result.groups.reduce((sum, group) => sum + group.totals[pack].total, 0), wholePack[pack].total);
  }
});
