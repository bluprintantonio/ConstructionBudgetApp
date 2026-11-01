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
};

export type ChapterGroup = {
  code: string;
  name: string;
  sortOrder: number;
  kind: "original" | "added";
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
  const code = override?.chapterCode ?? sourceCode ?? line.category;
  const chapter = chapters.find((row) => row.code === code);

  if (override && !chapter) {
    throw new Error(`Chapter override points to unknown chapter "${code}".`);
  }

  const sourceName = sourceCode
    ? line.category.replace(/^CAP\.\s*\d+\s*/i, "").trim()
    : line.category;

  return {
    code,
    name: chapter?.name ?? sourceName,
    sortOrder: chapter?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    kind: chapter?.kind ?? "original",
    specReference: chapter?.specReference ?? null,
    sourceChapterCode: sourceCode,
    isOverridden: Boolean(override),
    overrideReason: override?.reason ?? null,
  };
}

export function calculateChapterGroups(
  lines: readonly ChapterBudgetLine[],
  chapters: readonly ChapterRecord[],
  overrides: readonly ChapterOverrideRecord[],
  includeEmptyAdded = true,
): ChapterGroup[] {
  const grouped = new Map<string, ChapterBudgetLine[]>();
  const effectiveByCode = new Map<string, EffectiveChapter>();

  for (const line of lines) {
    const effective = getEffectiveChapter(line, chapters, overrides);
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

  return codes.map((code) => {
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
      lines: chapterLines,
      totals: {
        standard: totals.standard,
        eco: totals.eco,
        premium: totals.premium,
      },
    };
  });
}
