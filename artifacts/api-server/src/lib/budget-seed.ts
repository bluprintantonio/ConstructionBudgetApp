import type { BudgetLine, BudgetQuote } from "@workspace/api-zod";

export const pipelineUrl =
  "https://docs.google.com/spreadsheets/d/1vCrWO4ByjId8OW2N_S_LT7Ws_s7Csm1sur2UaYOFB50/edit";

export const sources = [
  {
    id: "pipeline",
    name: "pipeline",
    sourceType: "spreadsheet",
    url: pipelineUrl,
    note: "Original tracking sheet. Summary figures are shown as labeled; their accounting meaning has not been confirmed.",
  },
  {
    id: "boxes",
    name: "boxes",
    sourceType: "folder",
    url: "https://drive.google.com/drive/folders/1WNoNu6LtCeetuxt82_Y37LRQA56dzk0f",
    note: "Trade/vendor folders with proposals, estimates, comparisons, and product information.",
  },
  {
    id: "arquitetura",
    name: "arquitetura",
    sourceType: "folder",
    url: "https://drive.google.com/drive/folders/1BDAYlf1Bl8xpCM6kFNFC97tRZh7HV2Uq",
    note: "Plans, renders, DWGs/DXFs, and building-type references.",
  },
  {
    id: "plans",
    name: "arquitetura / plans",
    sourceType: "folder",
    url: "https://drive.google.com/drive/folders/14HUfDE23wDvSi7BuhZSwdkfRCZGsj5Fn",
    note: "Architecture plan files.",
  },
  {
    id: "renders",
    name: "arquitetura / renders",
    sourceType: "folder",
    url: "https://drive.google.com/drive/folders/1AOoqLHij399Y9IkFHFzoRELAxZGAEW5v",
    note: "Architecture renders.",
  },
  {
    id: "dwgs",
    name: "arquitetura / DWGs&DXF",
    sourceType: "folder",
    url: "https://drive.google.com/drive/folders/1GynbPWtBxN-P7gUV30-D05BSMksqN275",
    note: "CAD drawing files.",
  },
] as const;

export const buildingTypes = [
  {
    id: "bungalow",
    name: "Bungalow",
    sourceUrl:
      "https://drive.google.com/file/d/1nXQi-pFVOcVb1XZXz_t7IWTDKJGegX2h/view",
  },
  {
    id: "townhouse",
    name: "Townhouse",
    sourceUrl:
      "https://drive.google.com/file/d/1KivpEVxsVzV7QaqxLE1Bi85b3aycX3AZ/view",
  },
  {
    id: "twin-villa",
    name: "Twin villa",
    sourceUrl:
      "https://drive.google.com/file/d/1XI8RqgbiZp-ctahJfGHGg1V0YFd4cIyT/view",
  },
] as const;

export const sourceMetrics = [
  { id: "receitas", label: "Receitas", value: 108000, sourceColumn: "receitas" },
  { id: "balanco", label: "Balanço", value: 101300, sourceColumn: "balanço" },
  {
    id: "investimento",
    label: "Investimento",
    value: 122000,
    sourceColumn: "investimento",
  },
  { id: "despesas", label: "Despesas", value: 6700, sourceColumn: "despesas" },
] as const;

type LineValues = {
  receitas?: number | null;
  balanco?: number | null;
  investimento?: number | null;
  despesas?: number | null;
  vendor?: string | null;
  sourceNote?: string | null;
};

type BudgetLineSeed = Omit<BudgetLine, "createdAt" | "updatedAt">;

function line(
  id: string,
  category: string,
  item: string,
  values: LineValues = {},
): BudgetLineSeed {
  return {
    id,
    category,
    item,
    buildingType: null,
    vendor: values.vendor ?? null,
    receitas: values.receitas ?? null,
    balanco: values.balanco ?? null,
    investimento: values.investimento ?? null,
    despesas: values.despesas ?? null,
    quoteAmount: null,
    status: "needs_review",
    reviewStatus: "unreviewed",
    sourceRow: null,
    sourceNote:
      values.sourceNote ??
      "Imported from pipeline. Original source column is preserved; confirm its meaning before treating it as a budget or actual.",
  };
}

export const seedLines: BudgetLineSeed[] = [
  line("src-land-half-vale", "Terreno", "1/2 Vale da Galega", {
    balanco: 45000,
    investimento: 15000,
  }),
  line("src-investment-contract", "Terreno", "investment contract", {
    receitas: 8000,
    investimento: 500,
  }),
  line("src-deed", "Terreno", "deed", { balanco: 108000, investimento: 108000 }),
  line("src-imt-is", "Terreno", "registo IMT IS", { investimento: 10800 }),
  line("src-plot-swap", "Terreno", "plot swap", { investimento: 500 }),
  line("src-deed-plot52", "Terreno", "deed — plot 52", { despesas: 800 }),
  line("src-reservation-52", "Terreno", "reserva — plot 52", {
    receitas: 15000,
    investimento: 500,
  }),
  line("src-reservation-53", "Terreno", "reserva — plot 53", { receitas: 15000 }),
  line("src-topografo", "Serviços", "topografo", { despesas: 450 }),
  line("src-olga", "Serviços", "Olga", { balanco: 200, despesas: 1200 }),
  line("src-memo-desc", "Serviços", "memo desc", { despesas: 750 }),
  line("src-at", "Serviços", "AT", { balanco: 2000 }),
  line("src-proj-pip", "Arquitetura", "proj pip", { balanco: 2500 }),
  line("src-cpcv-52", "Terreno", "CPCV 52", { receitas: 35000 }),
  line("src-first-signal", "Terreno", "1º reforço sinal 52", { receitas: 35000 }),
  line("src-foundations", "Estrutura", "fundações"),
  line("src-slab", "Estrutura", "laje — 100m2"),
  line("src-structure", "Estrutura", "estrutura"),
  line("src-thermal-blocks", "Blocos térmicos", "blocos térmicos — 185m2", {
    balanco: 6845,
    vendor: "Verdasca",
  }),
  line("src-water-supply", "Águas", "abastecimento"),
  line("src-plumbing", "Águas", "canalização"),
  line("src-electricity", "Eletricidade", "electricidade", {
    receitas: 5000,
    investimento: 3500,
    vendor: "Terra Volt",
  }),
  line("src-acoustics", "Acústica", "acustica"),
  line("src-exterior-finish", "Revestimentos", "revestimento ext"),
  line("src-plasterboard", "Acabamentos", "pladur"),
  line("src-painting", "Acabamentos", "pintura"),
  line("src-lighting", "Iluminação", "iluminação", { vendor: "Bricoware" }),
  line("src-carpentry", "Carpintaria", "carpintaria", {
    receitas: 15250,
    vendor: "Tramadel",
  }),
  line("src-kitchen", "Cozinha", "cozinha", { receitas: 4900, vendor: "Tramadel" }),
  line("src-windows", "Janelas", "janelas", { receitas: 17100, vendor: "Tramadel" }),
  line("src-security-door", "Portas", "porta alta segurança", {
    receitas: 1200,
    vendor: "Dierre",
  }),
  line("src-gates", "Portões", "portões automaticos", {
    receitas: 2700,
    vendor: "Daportas",
  }),
  line("src-interior-finish", "Revestimentos", "revestimento int", {
    vendor: "Casa Peixoto",
  }),
  line("src-bathrooms", "Sanitários", "wcs"),
  line("src-solar", "Solar", "solar", { receitas: 4900, vendor: "Pelaf" }),
  line("src-pool", "Piscina", "piscina", { receitas: 20000, vendor: "Blueliving" }),
  line("src-outdoor-walls", "Exterior", "muros"),
  line("src-garden", "Exterior", "jardim"),
  line("src-pergola", "Exterior", "pergola"),
  line("src-deck", "Exterior", "deck"),
];

type QuoteSeed = Omit<
  BudgetQuote,
  "createdAt" | "updatedAt" | "modifiedAt"
> & { modifiedAt: Date | null };

function quote(
  id: string,
  fileName: string,
  category: string,
  fileId: string,
  documentType: BudgetQuote["documentType"],
  modifiedAt: string,
  options: {
    vendor?: string | null;
    folderId?: string;
    note?: string | null;
  } = {},
): QuoteSeed {
  return {
    id,
    fileName,
    category,
    vendor: options.vendor ?? null,
    documentType,
    status: "needs_review",
    amount: null,
    buildingType: null,
    modifiedAt: new Date(modifiedAt),
    sourceUrl: `https://drive.google.com/file/d/${fileId}/view`,
    sourceFolderUrl: options.folderId
      ? `https://drive.google.com/drive/folders/${options.folderId}`
      : "https://drive.google.com/drive/folders/1WNoNu6LtCeetuxt82_Y37LRQA56dzk0f",
    note:
      options.note ??
      "Linked from boxes. Price and building-type applicability have not been extracted; review the source file.",
  };
}

export const seedQuotes: QuoteSeed[] = [
  quote(
    "doc-carpentry-quote",
    "ORC_MAD.2026.120.A.pdf",
    "Carpintaria",
    "1tfOyQboWoUHroF196UxMzZ79RfpWKSpK",
    "estimate",
    "2026-06-02T20:18:07.471Z",
    { vendor: "Tramadel", folderId: "1QMHsC8ebtV62KgtZPK_7FtBUQ9qUR02u" },
  ),
  quote(
    "doc-kitchen-quote",
    "ORC_MAD.2026.120.A.pdf",
    "Cozinha",
    "1vTmhaKCR5YkiAxv0T-zIO1P4mo81nRK1",
    "estimate",
    "2026-05-26T13:52:05.000Z",
    {
      vendor: "Tramadel",
      folderId: "1SaY2mLktEsLI7yY5D9GiuN8QgUsooFSj",
      note: "Same filename and file size as the carpentry estimate; verify whether this is a duplicate or a shared estimate.",
    },
  ),
  quote(
    "doc-blocks-quote",
    "2026115_Orçamento_S00598_20260522.pdf",
    "Blocos térmicos",
    "1hD_LzaNZAPWmwADUJFxfGygb5iuk3yTO",
    "estimate",
    "2026-06-02T20:13:43.770Z",
    {
      vendor: "Verdasca",
      folderId: "1E62LHv7IN9Bwhh6WBaX3ozug6I0lK3eb",
      note: "A matching copy appears under lajes; this record points to the source under eco blocos.",
    },
  ),
  quote(
    "doc-blocks-cost-comparison",
    "Comparação de custos.pdf",
    "Blocos térmicos",
    "1QKbm0KCfLajzmKXHqdtKmC5c8Qp4Cbpu",
    "comparison",
    "2026-06-15T10:58:03.156Z",
    {
      vendor: "Verdasca",
      folderId: "1E62LHv7IN9Bwhh6WBaX3ozug6I0lK3eb",
      note: "Cost comparison document; not treated as a standalone quote.",
    },
  ),
  quote(
    "doc-blocks-unknown-266307",
    "266307.pdf",
    "Blocos térmicos",
    "1yPVd9HBn18MS_H406KkeqzlMwN88R49A",
    "unknown",
    "2026-07-10T14:04:13.618Z",
    { folderId: "1E62LHv7IN9Bwhh6WBaX3ozug6I0lK3eb" },
  ),
  quote(
    "doc-windows-quote",
    "ORC_MET.2026.034.A.pdf",
    "Janelas",
    "1_eMCNqPcA2Trm9okkVyWwrs7WHbGEcS1",
    "estimate",
    "2026-06-02T20:16:59.881Z",
    { vendor: "Tramadel", folderId: "1eCN1fLWbK7W88o9AF6qWcghZwBD2VMbk" },
  ),
  quote(
    "doc-pool-quote-715",
    "715.2026 António Lopes II 5,00x2,50.pdf",
    "Piscina",
    "15boaiS7XMuZvfF9IcRC_BplJ9TQh2p9s",
    "proposal",
    "2026-06-02T20:19:50.000Z",
    { vendor: "Blueliving", folderId: "1uZNpen3x_gdCzeTTyyu3IFeYhZzNVZcI" },
  ),
  quote(
    "doc-pool-quote-p254",
    "P254-26-António Lopes-Alenquer.pdf",
    "Piscina",
    "1HoE0pUB1HapX5kDp-wmZOnxDN64LG8Un",
    "proposal",
    "2026-06-11T08:32:20.000Z",
    { vendor: "Blueliving", folderId: "1uZNpen3x_gdCzeTTyyu3IFeYhZzNVZcI" },
  ),
  quote(
    "doc-door-quote",
    "PC26.060 - PROMOTOR - ANTÓNIO LOPES - 10 moradias em Lisboa Alenquer.pdf",
    "Portas",
    "1mtfYYgEpye-KOLrCjs-b1XN4KDZQ3k1r",
    "proposal",
    "2026-06-02T20:29:02.911Z",
    { vendor: "Dierre", folderId: "1I4Z-G-DqKK4mXcgt9_W3KqtnnTGZ3sfB" },
  ),
  quote(
    "doc-gates-quote",
    "Orcamento_ORC-2026-03262.pdf",
    "Portões",
    "1V6shKIbh8G4U5eAZflS2ZIJOoviNP0_W",
    "estimate",
    "2026-06-09T09:10:43.649Z",
    { vendor: "Daportas", folderId: "1jEIh9FiKPXfIFB3OS4TGMHOhF3Igmbm_" },
  ),
  quote(
    "doc-carport-panel",
    "ORC_SLS_AntonioLopes_CarportPainelSandwich.pdf",
    "Carport",
    "1ft2ibrxShXDb3vQhinrNPawDyI1wLBio",
    "estimate",
    "2026-10-15T17:05:05.060Z",
    { vendor: "SLS", folderId: "1lW59Bhlzpze4aU9W5dTdsXt_a6RGkZUt" },
  ),
  quote(
    "doc-carport-solar",
    "ORC_SLS_AntonioLopes_CarportPainelSolar.pdf",
    "Carport",
    "1596mVd1SWIza-sS6_iUV-nGXeiVn267c",
    "estimate",
    "2026-10-15T17:04:41.766Z",
    { vendor: "SLS", folderId: "1lW59Bhlzpze4aU9W5dTdsXt_a6RGkZUt" },
  ),
  quote(
    "doc-solar-quote",
    "Proposta Solar-0189-2026F.pdf",
    "Solar",
    "1UT3j5yBHSpByc5EGZzkIcDCGhxyZDdAL",
    "proposal",
    "2026-06-12T08:34:47.042Z",
    { vendor: "Pelaf", folderId: "1r-R8BN2OOmn3d87v8Ue0SGZ4b70BQdFX" },
  ),
  quote(
    "doc-solar-estimate",
    "2026_0309_00.pdf",
    "Solar",
    "1ds71Q4YAcsETMY8ii21iFVM28BhdhqW5",
    "estimate",
    "2026-06-02T20:16:14.054Z",
    { vendor: "Pelaf", folderId: "1r-R8BN2OOmn3d87v8Ue0SGZ4b70BQdFX" },
  ),
  quote(
    "doc-water-estimate",
    "0104.26.pdf",
    "Águas",
    "1A3WYtb0M-Su7FRiBleTEtwwsJs6o2fZH",
    "estimate",
    "2026-10-15T17:05:55.667Z",
    { folderId: "1bz_rNS4GB4qsbVxbdUiw2d7MWd6bOebE" },
  ),
  quote(
    "doc-electric-quote-3d",
    "2026115 PLAL 20260519 Quot 3D A4P.pdf",
    "Eletricidade",
    "1S_5sA_Nv1bU6Ddsg7JFw3Ce9XWlgG7aD",
    "proposal",
    "2026-06-02T20:14:01.722Z",
    { folderId: "1E62LHv7IN9Bwhh6WBaX3ozug6I0lK3eb" },
  ),
  quote(
    "doc-electric-quote-l0",
    "2026115 PLAL 20260519 Quot L0 A4P.pdf",
    "Eletricidade",
    "1OiQ67wEH2fQ6aIXqd7elmfPZnVyVBss4",
    "proposal",
    "2026-06-02T20:14:12.764Z",
    { folderId: "1E62LHv7IN9Bwhh6WBaX3ozug6I0lK3eb" },
  ),
  quote(
    "doc-electric-quote-l1",
    "2026115 PLAL 20260519 Quot L1 A4P.pdf",
    "Eletricidade",
    "1cgqV2oJsLil5e1LBLGcDMCmG49lG6_aw",
    "proposal",
    "2026-06-02T20:14:22.851Z",
    { folderId: "1E62LHv7IN9Bwhh6WBaX3ozug6I0lK3eb" },
  ),
  quote(
    "doc-appliance-price-list",
    "Tabela de Preços Geral_Bosch_05.2026.pdf",
    "Eletrodomésticos",
    "1QqyOTsBsq8aJV70nsGK9h8IOTpwHdEFP",
    "specification",
    "2026-06-02T20:21:42.156Z",
    { vendor: "Bosch", folderId: "1MWuXVtJ2KqbKjZ1iI406hHPb07aZRvJ9" },
  ),
  quote(
    "doc-appliance-siemens-price-list",
    "Tabela de Preços Siemens - Abril 2026.pdf",
    "Eletrodomésticos",
    "17fkA8c6Y1t-DV7H6wPFm0ynrr0TMiKc0",
    "specification",
    "2026-06-02T20:21:55.382Z",
    { vendor: "Siemens", folderId: "1MWuXVtJ2KqbKjZ1iI406hHPb07aZRvJ9" },
  ),
] ;

export function toQuoteRow(seed: QuoteSeed) {
  return {
    ...seed,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
