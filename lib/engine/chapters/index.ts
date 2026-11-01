import {
  calculatePackTotals,
  type PackBudgetLine,
  type PackCost,
} from "../packs/index.ts";

export type ChapterRecord = {
  code: string;
  name: string;
  sortOrder: number;
  kind: "original" | "added";
  specReference: string | null;
  decidedOn?: string | null;
  decisionReason?: string | null;
};

export type ChapterOverrideRecord = {
  budgetLineCode: string;
  chapterCode: string;
  reason: string;
};

export type ChapterBudgetLine = PackBudgetLine & {
  category: string;
  code?: string | null;
};

export type EffectiveChapter = ChapterRecord & {
  sourceChapterCode: string | null;
  isOverridden: boolean;
  overrideReason: string | null;
  warning: ChapterOverrideWarning | null;
};

export type ChapterOverrideWarning = {
  budgetLineCode: string;
  chapterCode: string;
  message: string;
};

export type ChapterGroupsResult = {
  ready: boolean;
  groups: ChapterGroup[];
  warnings: ChapterOverrideWarning[];
};

export type ChapterGroup = {
  code: string;
  name: string;
  sortOrder: number;
  kind: "original" | "added";
  specReference: string | null;
  decidedOn: string | null;
  decisionReason: string | null;
  lines: ChapterBudgetLine[];
  totals: {
    standard: PackCost;
    eco: PackCost;
    premium: PackCost;
  };
};

export function sourceChapterCode(category: string): string | null {
  const match = category.match(/^CAP\.\s*(\d+)\b/i);
  return match ? `CAP. ${Number(match[1])}` : null;
}

export function getEffectiveChapter(
  line: ChapterBudgetLine,
  chapters: readonly ChapterRecord[],
  overrides: readonly ChapterOverrideRecord[],
): EffectiveChapter {
  const sourceCode = sourceChapterCode(line.category);
  const override = line.code
    ? overrides.find((row) => row.budgetLineCode === line.code)
    : undefined;
  const overrideChapter = override
    ? chapters.find((row) => row.code === override.chapterCode)
    : undefined;
  const warning = override && !overrideChapter
    ? {
        budgetLineCode: override.budgetLineCode,
        chapterCode: override.chapterCode,
        message: `override for line ${override.budgetLineCode} points to unknown chapter ${override.chapterCode}`,
      }
    : null;
  const appliedOverride = overrideChapter ? override : undefined;
  const code = appliedOverride?.chapterCode ?? sourceCode ?? line.category;
  const chapter = chapters.find((row) => row.code === code);

  const sourceName = sourceCode
    ? line.category.replace(/^CAP\.\s*\d+\s*/i, "").trim()
    : line.category;

  return {
    code,
    name: chapter?.name ?? sourceName,
    sortOrder: chapter?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    kind: chapter?.kind ?? "original",
    specReference: chapter?.specReference ?? null,
    decidedOn: chapter?.decidedOn ?? null,
    decisionReason: chapter?.decisionReason ?? null,
    sourceChapterCode: sourceCode,
    isOverridden: Boolean(appliedOverride),
    overrideReason: appliedOverride?.reason ?? null,
    warning,
  };
}

export function calculateChapterGroups(
  lines: readonly ChapterBudgetLine[],
  chapters: readonly ChapterRecord[] | undefined,
  overrides: readonly ChapterOverrideRecord[] | undefined,
  includeEmptyAdded = true,
): ChapterGroupsResult {
  if (!chapters || !overrides) {
    return { ready: false, groups: [], warnings: [] };
  }
  const grouped = new Map<string, ChapterBudgetLine[]>();
  const effectiveByCode = new Map<string, EffectiveChapter>();
  const warnings: ChapterOverrideWarning[] = [];

  for (const line of lines) {
    const effective = getEffectiveChapter(line, chapters, overrides);
    if (effective.warning) warnings.push(effective.warning);
    effectiveByCode.set(effective.code, effective);
    grouped.set(effective.code, [...(grouped.get(effective.code) ?? []), line]);
  }

  if (includeEmptyAdded) {
    for (const chapter of chapters) {
      if (chapter.kind === "added" && !grouped.has(chapter.code)) {
        grouped.set(chapter.code, []);
      }
    }
  }

  const chapterByCode = new Map(chapters.map((chapter) => [chapter.code, chapter]));
  const codes = [...grouped.keys()].sort((left, right) => {
    const leftChapter = chapterByCode.get(left) ?? effectiveByCode.get(left);
    const rightChapter = chapterByCode.get(right) ?? effectiveByCode.get(right);
    return (
      (leftChapter?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (rightChapter?.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.localeCompare(right, "en", { numeric: true })
    );
  });

  const groups = codes.map((code) => {
    const chapter = chapterByCode.get(code) ?? effectiveByCode.get(code);
    if (!chapter) {
      throw new Error(`Could not resolve effective chapter "${code}".`);
    }
    const chapterLines = grouped.get(code) ?? [];
    const totals = calculatePackTotals(chapterLines, []);
    return {
      code,
      name: chapter.name,
      sortOrder: chapter.sortOrder,
      kind: chapter.kind,
      specReference: chapter.specReference ?? null,
      decidedOn: chapter.decidedOn ?? null,
      decisionReason: chapter.decisionReason ?? null,
      lines: chapterLines,
      totals: {
        standard: totals.standard,
        eco: totals.eco,
        premium: totals.premium,
      },
    };
  });
  return { ready: true, groups, warnings };
}
