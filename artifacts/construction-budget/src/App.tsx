import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check,
  CheckCircle2, ChevronDown, CircleHelp, ClipboardList, ExternalLink, FileCheck2,
  FileSpreadsheet, FileText, Folder, HardHat, LayoutDashboard, Link2, Menu, MoreHorizontal,
  Plus, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Trash2, UploadCloud,
  X, AlertCircle, Pencil, Landmark
} from 'lucide-react';
import {
  BudgetExtra, BudgetExtraUpdate, BudgetLine, BudgetQuote, BudgetQuoteLink, BudgetLineInput, BudgetQuoteInput,
  BudgetQuoteStatus, BudgetQuoteDocumentType,
  useHealthCheck, useGetBudgetDashboard, useGetBudgetProjects, useGetBudgetSources,
  useCheckBudgetSourceConnection,
  useGetBudgetExtras, useUpdateBudgetExtra,
  useGetBudgetLines, useGetBudgetQuotes, useGetBudgetQuoteLinks, useUpdateBudgetQuoteLinks,
  useCreateBudgetLine, useImportBudgetLines,
  useUpdateBudgetLine, useDeleteBudgetLine, useCreateBudgetQuote, useUpdateBudgetQuote,
  useUpdateBudgetLineMarker,
  useDeleteBudgetQuote, getGetBudgetDashboardQueryKey, getGetBudgetLinesQueryKey,
  getGetBudgetExtrasQueryKey,
  getGetBudgetQuotesQueryKey, getGetBudgetQuoteLinksQueryKey
} from '@workspace/api-client-react';
import { calculatePackTotals } from '@workspace/engine/packs';
import { calculateQuoteComparisons, type QuoteWarnings } from '@workspace/engine/quotes';
import PlannerPage from './pages/planner';

const queryClient = new QueryClient();
const quoteStatuses = Object.values(BudgetQuoteStatus);
const documentTypes = Object.values(BudgetQuoteDocumentType);
const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/budget', label: 'Materials map', icon: ClipboardList },
  { href: '/planner', label: 'Planner', icon: Landmark },
  { href: '/quotes', label: 'Quotes & documents', icon: FileCheck2 },
  { href: '/sources', label: 'Sources', icon: Link2 },
];
type CurrencyCode = 'EUR' | 'GBP' | 'USD';
const CurrencyContext = createContext<{
  currencyCode: CurrencyCode;
  setCurrencyCode: (code: CurrencyCode) => void;
}>({ currencyCode: 'EUR', setCurrencyCode: () => undefined });
const useCurrency = () => useContext(CurrencyContext);
function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(() => {
    const saved = localStorage.getItem('construction-budget-currency');
    return saved === 'GBP' || saved === 'USD' ? saved : 'EUR';
  });
  useEffect(() => {
    localStorage.setItem('construction-budget-currency', currencyCode);
  }, [currencyCode]);
  return <CurrencyContext.Provider value={{ currencyCode, setCurrencyCode }}>{children}</CurrencyContext.Provider>;
}
const currency = (amount: number | null | undefined, code: CurrencyCode = 'EUR') => amount == null
  ? '—'
  : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(amount);
const shortDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
const titleCase = (value?: string | null) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';
const localDateString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};
const preciseCurrency = (amount: number | null | undefined, code: CurrencyCode = 'EUR') => amount == null
  ? '—'
  : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount);
function QuoteWarningLabels({ warnings }: { warnings: QuoteWarnings }) {
  const labels = [
    warnings.scopeUnknown ? 'Scope type unknown' : null,
    warnings.vatUnknown ? 'VAT basis unknown' : null,
    warnings.expired ? 'Quote validity has expired' : null,
  ].filter((label): label is string => label !== null);
  return labels.length
    ? <strong role="alert">Warning: {labels.join(' · ')}</strong>
    : null;
}

function parseCsvRows(input: string): string[][] {
  const firstLine = input.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  row.push(field);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function parseBudgetCsv(input: string): BudgetLineInput[] {
  const rows = parseCsvRows(input);
  if (rows.length < 2) throw new Error('Add the master CSV header and at least one material row.');
  const normalize = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const headers = rows[0].map(normalize);
  const get = (row: string[], name: string) => {
    const index = headers.indexOf(normalize(name));
    return index < 0 ? '' : (row[index] || '').trim();
  };
  const required = ['codigo', 'capitulo', 'descricao', 'und', 'quant', 'precostd', 'totalstd', 'precoeco', 'totaleco', 'precopremium', 'totalpremium'];
  if (required.some(header => !headers.includes(header))) {
    throw new Error('Use the master CSV columns: Código, Capítulo, Descrição, Und., Quant., and the three price/total pairs.');
  }
  const numeric = (value: string) => {
    if (!value) return null;
    let cleaned = value.replace(/\s/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
      cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? cleaned.replaceAll('.', '').replace(',', '.') : cleaned.replaceAll(',', '');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
    return parsed;
  };
  const seenCodes = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const code = get(row, 'codigo');
    const category = get(row, 'capitulo');
    const item = get(row, 'descricao');
    if (!code || !category || !item) throw new Error(`Row ${index + 2} needs code, chapter, and description.`);
    if (seenCodes.has(code)) throw new Error(`Duplicate material code "${code}" in the CSV.`);
    seenCodes.add(code);
    return {
      code,
      category,
      item,
      unit: get(row, 'und') || null,
      quantity: numeric(get(row, 'quant')),
      standardUnitPrice: numeric(get(row, 'preco std')),
      standardTotal: numeric(get(row, 'total std')),
      ecoUnitPrice: numeric(get(row, 'preco eco')),
      ecoTotal: numeric(get(row, 'total eco')),
      premiumUnitPrice: numeric(get(row, 'preco premium')),
      premiumTotal: numeric(get(row, 'total premium')),
      buildingType: null,
      vendor: null,
      receitas: null,
      balanco: null,
      investimento: null,
      despesas: null,
      quoteAmount: null,
      status: 'planned' as BudgetLineInput['status'],
      reviewStatus: 'confirmed' as BudgetLineInput['reviewStatus'],
      sourceRow: index + 2,
      sourceNote: 'Imported from boxes/mapa_quantidades.csv; source values preserved.',
    };
  });
}

function downloadBudgetCsv(lines: BudgetLine[], extras: BudgetExtra[]) {
  const packTotals = calculatePackTotals(lines, extras);
  const columns: [string, keyof BudgetLine][] = [
    ['Código', 'code'], ['Capítulo', 'category'], ['Descrição', 'item'], ['Und.', 'unit'],
    ['Quant.', 'quantity'], ['Preço Std', 'standardUnitPrice'], ['Total Std', 'standardTotal'],
    ['Preço Eco', 'ecoUnitPrice'], ['Total Eco', 'ecoTotal'], ['Preço Premium', 'premiumUnitPrice'],
    ['Total Premium', 'premiumTotal'],
  ];
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows: unknown[][] = [
    columns.map(([label]) => label),
    ...lines.map(line => columns.map(([, key]) => line[key])),
    [],
    ['Pack totals per one house unit'],
    ['Pack', 'Total', 'From CSV lines', 'From extras', 'Extras pending a price'],
  ];
  for (const [label, pack] of [
    ['Standard', packTotals.standard],
    ['Eco', packTotals.eco],
    ['Premium', packTotals.premium],
  ] as const) {
    rows.push([label, pack.total, pack.fromCsvLines, pack.fromExtras, pack.pendingExtraCount]);
  }
  const csv = rows.map(row => row.map(escape).join(';')).join('\r\n');
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = 'mapa-quantidades.csv';
  link.click();
  URL.revokeObjectURL(href);
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { currencyCode, setCurrencyCode } = useCurrency();
  return <div className="grain min-h-[100dvh]">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand">
        <div className="brand-mark"><HardHat size={19} strokeWidth={2.2} /></div>
        <div><strong>FIELDNOTES</strong><span>HOME PROJECT</span></div>
        <button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18}/></button>
      </div>
      <div className="project-switch">
        <div className="project-monogram">H</div>
        <div className="project-name"><small>ACTIVE PROJECT</small><strong>Home project</strong></div>
        <ChevronDown size={15}/>
      </div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="nav-list">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileNav(false)} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
          <Icon size={17} strokeWidth={1.8}/><span>{label}</span>
        </Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><div className="note-icon"><ShieldCheck size={16}/></div><div><strong>One source of truth</strong><p>Every figure stays tied to its source.</p></div></div>
        <div className="sidebar-settings"><Settings2 size={16}/> Workspace settings</div>
        <div className="profile"><div className="avatar">HP</div><div><strong>Project owner</strong><span>Homeowner</span></div><MoreHorizontal size={18}/></div>
      </div>
    </aside>
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar">
        <button className="menu-toggle" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button>
        <div className="breadcrumbs"><span>Home project</span><span className="slash">/</span><b>{navItems.find(i => i.href === location)?.label || 'Overview'}</b></div>
        <div className="topbar-right"><span className="sync-state"><span className="sync-dot"/>Working copy</span><label className="currency-control"><span>Display currency</span><select aria-label="Display currency" data-testid="select-display-currency" value={currencyCode} onChange={event => setCurrencyCode(event.target.value as CurrencyCode)}><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="USD">USD</option></select></label><button className="icon-button" aria-label="Help" onClick={() => setHelpOpen(true)}><CircleHelp size={18}/></button><div className="top-avatar">HP</div></div>
      </header>
      <div className="page-content">{children}</div>
      <Dialog open={helpOpen} title="A shared project record" subtitle="Fieldnotes keeps the working numbers connected to their origins." onClose={() => setHelpOpen(false)}>
        <div className="help-content"><p><strong>Materials map</strong> holds the coded items, quantities, and three price scenarios from the master CSV.</p><p><strong>Quotes & documents</strong> keep supplier details beside linked files from boxes.</p><p><strong>Sources</strong> keep architecture references separate from Eco, Standard, and Premium pricing.</p><div className="import-tip"><ShieldCheck size={15}/> Source labels and zero values are preserved as supplied.</div><div className="form-actions"><button className="button button-primary" onClick={() => setHelpOpen(false)}>Got it <Check size={15}/></button></div></div>
      </Dialog>
    </main>
  </div>;
}

function StatusPill({ value, kind = 'line' }: { value: string; kind?: 'line' | 'review' | 'quote' }) {
  const className = value === 'confirmed' || value === 'accepted' || value === 'paid' || value === 'committed'
    ? 'good' : value === 'needs_review' || value === 'unreviewed' ? 'attention' : value === 'rejected' ? 'bad' : 'neutral';
  return <span className={`pill ${className} ${kind === 'review' ? 'review-pill' : ''}`}><i/>{titleCase(value)}</span>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading fade-up"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function MetricTile({ label, value, sourceColumn, fromCsvLines, fromCommonLines, fromPremiumRatedLines, notApplicableLineCount, notApplicableStandardValue, fromExtras, pendingExtraCount, icon: Icon, index, currencyCode }: { label: string; value: number; sourceColumn: string; fromCsvLines: number; fromCommonLines: number | null; fromPremiumRatedLines: number | null; notApplicableLineCount: number | null; notApplicableStandardValue: number | null; fromExtras: number; pendingExtraCount: number; icon: typeof Activity; index: number; currencyCode: CurrencyCode }) {
  return <article className="metric-tile fade-up" style={{ animationDelay: `${index * 60}ms` }}>
    <div className="metric-top"><span className="metric-icon"><Icon size={17}/></span><span className="source-col">{sourceColumn}</span></div>
    <div className="metric-value">{currency(value, currencyCode)}</div><div className="metric-label">{label}</div>
    <div className="metric-foot"><span>CSV lines + extras · markers affect Premium</span><ArrowUpRight size={14}/></div>
    {fromCommonLines !== null && fromPremiumRatedLines !== null
      ? <div className="metric-label">Common lines: {currency(fromCommonLines, currencyCode)} · Premium-rated lines: {currency(fromPremiumRatedLines, currencyCode)} · Extras: {currency(fromExtras, currencyCode)}</div>
      : <div className="metric-label">From CSV lines: {currency(fromCsvLines, currencyCode)} · from extras: {currency(fromExtras, currencyCode)}</div>}
    {notApplicableLineCount !== null && notApplicableLineCount > 0 && notApplicableStandardValue !== null && <div className="metric-label">{notApplicableLineCount} {notApplicableLineCount === 1 ? 'line' : 'lines'} not applicable in Premium · Standard value: {currency(notApplicableStandardValue, currencyCode)}</div>}
    {pendingExtraCount > 0 && <div className="metric-label">{pendingExtraCount} {pendingExtraCount === 1 ? 'extra' : 'extras'} pending a price</div>}
  </article>;
}

function LoadingBlock() {
  return <div className="skeleton-wrap" aria-label="Loading"><div className="skeleton sk-title"/><div className="skeleton-grid">{[1,2,3,4].map(n => <div className="skeleton sk-card" key={n}/>)}</div><div className="skeleton sk-table"/></div>;
}
function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return <div className="error-state"><AlertCircle size={22}/><div><strong>Couldn’t load this view</strong><p>Check your connection, then try again.</p></div><button className="button button-secondary" onClick={onRetry}><RefreshCw size={15}/> Retry</button></div>;
}
function EmptyState({ icon: Icon, title, body, action }: { icon: typeof FileText; title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={21}/></div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function Overview() {
  const dashboard = useGetBudgetDashboard();
  const lines = useGetBudgetLines();
  const quotes = useGetBudgetQuotes();
  const projects = useGetBudgetProjects();
  const health = useHealthCheck();
  const client = useQueryClient();
  const { currencyCode } = useCurrency();
  const recentLines = [...(lines.data || [])]
    .sort((a, b) => new Intl.Collator('pt', { numeric: true }).compare(a.code || '', b.code || ''))
    .slice(0, 5);
  if (dashboard.isLoading || lines.isLoading || quotes.isLoading) return <LoadingBlock/>;
  if (dashboard.isError || lines.isError || quotes.isError) return <ErrorBlock onRetry={() => { void dashboard.refetch(); void lines.refetch(); void quotes.refetch(); }}/>;
  const metrics = dashboard.data?.sourceMetrics || [];
  return <div>
    <PageHeader eyebrow="PROJECT CONTROL / 01" title="Project overview" description="A clear view of the numbers, proposals, and references behind your build." action={<button className="button button-secondary" onClick={() => { void client.invalidateQueries(); }}><RefreshCw size={15}/> Refresh data</button>}/>
    <section className="welcome-band">
      <div className="welcome-copy"><span className="welcome-tag"><span/> PROJECT WORKSPACE</span><h2>Plan with the<br/><em>material map.</em></h2><p>Quantities, three estimate tiers, supplier proposals, and architectural references — organized in one place.</p>
        <div className="welcome-actions"><Link href="/budget" className="button button-light">Explore materials <ArrowRight size={15}/></Link><Link href="/quotes" className="welcome-link">Open proposals <ArrowUpRight size={15}/></Link></div>
      </div>
      <div className="welcome-art" aria-hidden="true"><div className="art-grid"/><div className="blueprint"><div className="bp-topline"/><div className="bp-room bp-a"/><div className="bp-room bp-b"/><div className="bp-room bp-c"/><div className="bp-room bp-d"/><div className="bp-label">GROUND FLOOR / 01</div><div className="bp-dimension">NTS</div></div><div className="art-stamp">H<br/><span>PLAN SET</span></div><div className="art-coordinate">REFERENCE / A-01<br/>PROJECT DRAWING</div></div>
    </section>
    <div className="section-heading"><div><div className="eyebrow">ONE HOUSE UNIT / PACK TOTALS</div><h2>Estimate totals by tier</h2><p className="currency-assumption">Display currency: {currencyCode} (assumed; the CSV has no currency field).</p></div><div className="section-meta"><span className={`health-dot ${health.data?.status === 'ok' ? 'is-up' : ''}`}/>{health.data?.status === 'ok' ? 'App online' : 'Master map'}</div></div>
    {metrics.length ? <div className="metrics-grid">{metrics.map((metric, i) => <MetricTile key={metric.id} {...metric} icon={[Activity, Landmark, ArrowDownRight][i % 3]} index={i} currencyCode={currencyCode}/>)}</div> : <div className="metric-placeholder"><FileSpreadsheet size={19}/><span>Master map totals will appear here when available.</span></div>}
    <div className="dashboard-lower">
      <section className="panel recent-panel"><div className="panel-head"><div><div className="eyebrow">MASTER MATERIAL MAP</div><h2>First coded items</h2></div><Link href="/budget" className="text-link">View all <ArrowRight size={14}/></Link></div>
        {recentLines.length ? <div className="compact-list">{recentLines.map(line => <div className="compact-row" key={line.id} data-testid={`row-overview-line-${line.id}`}><div className="category-mark">{line.code || 'M'}</div><div className="compact-main"><strong>{line.item}</strong><span>{line.code} · {line.category}</span></div><div className="compact-end"><strong>{currency(line.standardTotal, currencyCode)}</strong><span>Standard</span></div></div>)}</div> : <EmptyState icon={ClipboardList} title="No material rows yet" body="Import the master quantity map to organize estimate items." action={<Link href="/budget" className="text-link">Open materials map <ArrowRight size={14}/></Link>}/>}
      </section>
      <aside className="side-summary">
        <div className="summary-head"><div className="eyebrow">REVIEW QUEUE</div><span className="summary-mark"><CheckCircle2 size={17}/></span></div>
        <div className="summary-number">{(dashboard.data?.linesNeedingReview || 0) + (dashboard.data?.quotesNeedingReview || 0)}</div><h3>Supplier documents to review</h3><p>Linked proposal files from boxes are awaiting review.</p>
        <div className="queue-row"><span>Master items</span><b>{dashboard.data?.lineCount ?? 0}</b></div><div className="queue-row"><span>Supplier documents</span><b>{dashboard.data?.quotesNeedingReview ?? 0}</b></div>
        <Link href="/quotes" className="button button-primary full-button">Open review queue <ArrowRight size={15}/></Link>
        <div className="summary-divider"/>
        <div className="project-link"><div className="project-link-icon"><BookOpen size={16}/></div><div><small>BUILDING REFERENCES</small><strong>{projects.data?.length ?? 0} linked building types</strong></div><Link href="/sources" aria-label="View source references"><ArrowUpRight size={15}/></Link></div>
      </aside>
    </div>
    <div className="data-footnote"><ShieldCheck size={14}/> Pack totals are for one house unit. Blank or pending extra prices contribute 0. Currency is assumed for display and is not stated in the source.</div>
  </div>;
}

type DialogProps = { open: boolean; title: string; subtitle: string; onClose: () => void; children: ReactNode };
function Dialog({ open, title, subtitle, onClose, children }: DialogProps) {
  if (!open) return null;
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true"><div className="dialog-head"><div><div className="eyebrow">PROJECT REGISTER</div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18}/></button></div>{children}</section></div>;
}
function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`form-field ${wide ? 'field-wide' : ''}`}><span>{label}</span>{children}</label>;
}
function FormActions({ onCancel, pending, label }: { onCancel: () => void; pending: boolean; label: string }) {
  return <div className="form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : <>{label}<ArrowRight size={15}/></>}</button></div>;
}

type ExtraDraft = {
  quantity: string;
  unitPrice: string;
  priceStatus: BudgetExtra['priceStatus'];
  notes: string;
};

function extraDraftFrom(extra: BudgetExtra): ExtraDraft {
  return {
    quantity: String(extra.quantity),
    unitPrice: extra.unitPrice == null ? '' : String(extra.unitPrice),
    priceStatus: extra.priceStatus,
    notes: extra.notes ?? '',
  };
}

function BudgetPage() {
  const query = useGetBudgetLines(); const dashboard = useGetBudgetDashboard(); const client = useQueryClient();
  const extrasQuery = useGetBudgetExtras(); const updateExtra = useUpdateBudgetExtra();
  const quotesQuery = useGetBudgetQuotes(); const quoteLinksQuery = useGetBudgetQuoteLinks();
  const { currencyCode } = useCurrency();
  const create = useCreateBudgetLine(); const update = useUpdateBudgetLine(); const remove = useDeleteBudgetLine(); const importer = useImportBudgetLines();
  const updateMarker = useUpdateBudgetLineMarker();
  const [search, setSearch] = useState(''); const [chapterFilter, setChapterFilter] = useState('all'); const [editing, setEditing] = useState<BudgetLine | null>(null); const [createOpen, setCreateOpen] = useState(false); const [importOpen, setImportOpen] = useState(false); const [importText, setImportText] = useState(''); const [message, setMessage] = useState('');
  const [extraDrafts, setExtraDrafts] = useState<Record<string, ExtraDraft>>({});
  const lines = [...(query.data || [])].sort((a, b) => new Intl.Collator('pt', { numeric: true }).compare(a.code || '', b.code || ''));
  const quoteComparisons = useMemo(() => calculateQuoteComparisons(
    quotesQuery.data || [],
    quoteLinksQuery.data || [],
    lines.map(line => ({ code: line.code, standardTotal: line.standardTotal })),
    localDateString(),
  ), [quotesQuery.data, quoteLinksQuery.data, lines]);
  const quotesById = new Map((quotesQuery.data || []).map(quote => [quote.id, quote]));
  const chapters = useMemo(() => [...new Set(lines.map(line => line.category))].sort((a, b) => new Intl.Collator('pt', { numeric: true }).compare(a, b)), [lines]);
  const filtered = useMemo(() => lines.filter(line => (chapterFilter === 'all' || line.category === chapterFilter) && `${line.code || ''} ${line.category} ${line.item} ${line.unit || ''}`.toLowerCase().includes(search.toLowerCase())), [lines, chapterFilter, search]);
  const packMetrics = dashboard.data?.sourceMetrics || [];
  const premiumReconciliation = useMemo(
    () => calculatePackTotals(lines, []).premiumReconciliation,
    [lines],
  );
  const reload = () => { void query.refetch(); void dashboard.refetch(); void quotesQuery.refetch(); void quoteLinksQuery.refetch(); };
  const draftForExtra = (extra: BudgetExtra) => extraDrafts[extra.id] ?? extraDraftFrom(extra);
  const changeExtraDraft = (extra: BudgetExtra, patch: Partial<ExtraDraft>) => setExtraDrafts(current => ({
    ...current,
    [extra.id]: { ...(current[extra.id] ?? extraDraftFrom(extra)), ...patch },
  }));
  const saveExtra = (extra: BudgetExtra) => {
    const draft = draftForExtra(extra);
    const quantity = Number(draft.quantity);
    const priceText = draft.unitPrice.trim();
    const unitPrice = priceText ? Number(priceText) : null;
    if (!Number.isInteger(quantity) || quantity < 0) { setMessage('Extra quantity must be a whole number of 0 or more.'); return; }
    if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) { setMessage('Enter a valid non-negative unit price, or leave it blank.'); return; }
    const payload: BudgetExtraUpdate = {
      quantity,
      unitPrice,
      priceStatus: draft.priceStatus,
      notes: draft.notes.trim() || null,
    };
    updateExtra.mutate({ extraId: extra.id, data: payload }, {
      onSuccess: () => {
        setExtraDrafts(current => { const next = { ...current }; delete next[extra.id]; return next; });
        setMessage(`${extra.name} saved.`);
        void client.invalidateQueries({ queryKey: getGetBudgetExtrasQueryKey() });
      },
      onError: () => setMessage(`Could not save ${extra.name}.`),
    });
  };
  const saveMarker = (line: BudgetLine, marker: BudgetLine['marker']) => {
    if (!line.code) return;
    updateMarker.mutate(
      { budgetLineCode: line.code, data: { marker } },
      {
        onSuccess: () => {
          setMessage(`${line.code} marker saved. The Premium total is updated.`);
          void client.invalidateQueries({ queryKey: getGetBudgetLinesQueryKey() });
          void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() });
        },
        onError: () => setMessage(`Could not save the marker for ${line.code}.`),
      },
    );
  };
  const useQuotePrice = (extra: BudgetExtra, quote: BudgetQuote) => {
    if (quote.amount == null) return;
    updateExtra.mutate({
      extraId: extra.id,
      data: { unitPrice: quote.amount, priceStatus: 'quoted', quoteId: quote.id },
    }, {
      onSuccess: () => {
        setExtraDrafts(current => { const next = { ...current }; delete next[extra.id]; return next; });
        setMessage(`Used ${quote.fileName} price for ${extra.name}.`);
        void client.invalidateQueries({ queryKey: getGetBudgetExtrasQueryKey() });
        void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() });
      },
      onError: () => setMessage(`Could not use ${quote.fileName} for ${extra.name}.`),
    });
  };
  const save = (e: FormEvent<HTMLFormElement>, line?: BudgetLine) => {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    const text = (key: string) => String(fd.get(key) || '').trim();
    const numeric = (key: string) => { const value = text(key); if (!value) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
    const code = text('code');
    if (lines.some(existing => existing.code === code && existing.id !== line?.id)) { setMessage(`Material code "${code}" already exists.`); return; }
    const payload: BudgetLineInput = {
      code, category: text('category'), item: text('item'), unit: text('unit'),
      quantity: numeric('quantity'), standardUnitPrice: numeric('standardUnitPrice'), standardTotal: numeric('standardTotal'),
      ecoUnitPrice: numeric('ecoUnitPrice'), ecoTotal: numeric('ecoTotal'), premiumUnitPrice: numeric('premiumUnitPrice'), premiumTotal: numeric('premiumTotal'),
      buildingType: null, vendor: null, receitas: null, balanco: null, investimento: null, despesas: null, quoteAmount: null,
      status: 'planned', reviewStatus: 'confirmed', sourceRow: line?.sourceRow ?? null, sourceNote: text('sourceNote') || null,
    };
    const done = () => { setCreateOpen(false); setEditing(null); setMessage(line ? 'Material updated.' : 'Material added.'); void client.invalidateQueries({ queryKey: getGetBudgetLinesQueryKey() }); void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() }); };
    line ? update.mutate({ lineId: line.id, data: payload }, { onSuccess: done }) : create.mutate({ data: payload }, { onSuccess: done });
  };
  const confirmDelete = (line: BudgetLine) => { if (window.confirm(`Remove “${line.item}” from the app's material map? The Drive source will not be changed.`)) remove.mutate({ lineId: line.id }, { onSuccess: () => { setMessage('Material removed from the app.'); void client.invalidateQueries({ queryKey: getGetBudgetLinesQueryKey() }); void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() }); } }); };
  const importRows = (e: FormEvent) => { e.preventDefault(); try { const parsed = parseBudgetCsv(importText); importer.mutate({ data: parsed }, { onSuccess: () => { setImportOpen(false); setImportText(''); setMessage('Master rows imported.'); void client.invalidateQueries({ queryKey: getGetBudgetLinesQueryKey() }); void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() }); }, onError: () => setMessage('The CSV could not be imported. Check the master headers and try again.') }); } catch (error) { setMessage(error instanceof Error ? error.message : 'CSV could not be read.'); } };
  if (query.isLoading) return <LoadingBlock/>; if (query.isError) return <ErrorBlock onRetry={reload}/>;
  return <div>
     <PageHeader eyebrow="WORKSPACE / MASTER MAP" title="Materials & quantities" description="Coded items from the master CSV, with Eco, Standard, and Premium price tiers." action={<div className="heading-actions"><button className="button button-secondary" onClick={() => downloadBudgetCsv(lines, extrasQuery.data || [])} disabled={!lines.length || extrasQuery.isLoading || extrasQuery.isError}><FileSpreadsheet size={15}/> Export CSV</button><button className="button button-secondary" onClick={() => setImportOpen(true)}><UploadCloud size={15}/> Import master</button><button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={16}/> Add material</button></div>}/>
     <div className="register-strip"><div className="register-stat"><strong>{dashboard.data?.lineCount ?? lines.length}</strong><span>MASTER ITEMS</span></div><div className="register-stat"><strong>{chapters.length}</strong><span>CHAPTERS</span></div><div className="register-stat strip-note"><ShieldCheck size={17}/><span>Zero values and all three source tiers are preserved exactly.</span></div></div>
     <div className="data-footnote"><SlidersHorizontal size={14}/> Changing a marker changes the Premium total. Lines without a saved marker count as Common.</div>
     {packMetrics.length > 0 && <><div className="section-heading"><div><div className="eyebrow">ONE HOUSE UNIT / PACK ENGINE</div><h2>Pack totals</h2></div></div><div className="metrics-grid">{packMetrics.map((metric, i) => <MetricTile key={metric.id} {...metric} icon={[Activity, Landmark, ArrowDownRight][i % 3]} index={i} currencyCode={currencyCode}/>)}</div></>}
     {lines.length > 0 && <section className="panel register-panel">
       <div className="register-toolbar"><div><div className="eyebrow">PREMIUM RECONCILIATION</div><h2>CSV Premium to app Premium lines</h2></div></div>
       <div className="register-strip">
         <div className="register-stat"><strong>{currency(premiumReconciliation.csvPremiumTotal, currencyCode)}</strong><span>CSV Premium total (all lines at their CSV Premium price)</span></div>
         <div className="register-stat"><strong>−{currency(premiumReconciliation.commonUpliftRemoved, currencyCode)}</strong><span>Premium uplift removed on Common lines (Premium price &gt; Standard price)</span></div>
         <div className="register-stat"><strong>{currency(premiumReconciliation.premiumLinesUsedByApp, currencyCode)}</strong><span>Premium lines used by the app (plus extras)</span></div>
       </div>
       <div className="table-scroll scrollbar-thin"><table className="data-table budget-table">
         <thead><tr><th>CODE</th><th>DESCRIPTION</th><th>QTY</th><th>STANDARD PRICE</th><th>PREMIUM PRICE</th><th>DIFFERENCE</th></tr></thead>
         <tbody>{premiumReconciliation.commonUpliftLines.map((line, index) => <tr key={line.code || `${line.description}-${index}`}>
           <td><span className="material-code">{line.code || '—'}</span></td>
           <td>{line.description}</td>
           <td className="money-cell">{line.quantity}</td>
           <td className="money-cell">{currency(line.standardUnitPrice, currencyCode)}</td>
           <td className="money-cell">{currency(line.premiumUnitPrice, currencyCode)}</td>
           <td className="money-cell">{currency(line.difference, currencyCode)}</td>
         </tr>)}</tbody>
       </table></div>
     </section>}
    {message && <div className="inline-message"><Check size={15}/>{message}<button onClick={() => setMessage('')} aria-label="Dismiss message"><X size={14}/></button></div>}
     {(quotesQuery.isError || quoteLinksQuery.isError) && <div className="inline-message"><AlertCircle size={15}/>Quote comparisons could not be loaded. Refresh to try again.</div>}
    <section className="panel register-panel">
      <div className="register-toolbar"><div className="search-box"><Search size={16}/><input aria-label="Search materials" data-testid="input-search-budget-lines" placeholder="Search code, chapter, material…" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="toolbar-controls"><SlidersHorizontal size={15}/><select aria-label="Filter by chapter" value={chapterFilter} onChange={e => setChapterFilter(e.target.value)} data-testid="select-budget-chapter"><option value="all">All chapters</option>{chapters.map(chapter => <option value={chapter} key={chapter}>{chapter}</option>)}</select><button className="icon-button" title="Refresh" onClick={reload}><RefreshCw size={16}/></button></div></div>
      <div className="mobile-table-hint">Swipe horizontally to compare all three price tiers.</div><div className="table-scroll scrollbar-thin"><table className="data-table budget-table materials-table"><thead><tr><th>CODE</th><th>MARKER</th><th>CHAPTER</th><th>MATERIAL / DESCRIPTION</th><th>UNIT</th><th>QTY</th><th>ECO</th><th>STANDARD</th><th>PREMIUM</th><th/></tr></thead><tbody>
       {filtered.map(line => {
         const lineQuotes = quoteComparisons.filter(comparison => line.code != null && comparison.budgetLineCodes.includes(line.code));
         return <tr key={line.id} data-testid={`row-budget-line-${line.id}`}>
           <td><span className="material-code">{line.code || '—'}</span>{line.origin === 'imported' && line.sourceRow != null && line.sourceUrl && <a className="material-source-tag" href={line.sourceUrl} target="_blank" rel="noreferrer">CSV row {line.sourceRow}</a>}</td>
           <td><label className="form-field"><select aria-label={`Marker for ${line.code || line.item}`} style={{ minWidth: 126 }} value={line.marker || 'common'} disabled={!line.code || updateMarker.isPending} onChange={event => saveMarker(line, event.target.value as BudgetLine['marker'])}>{(['common', 'finishings', 'equipment', 'systems', 'not_applicable'] as BudgetLine['marker'][]).map(marker => <option key={marker} value={marker}>{marker === 'not_applicable' ? 'Not applicable in Premium' : titleCase(marker)}</option>)}</select></label></td>
           <td className="material-chapter">{line.category}</td>
           <td><strong>{line.item}</strong>{lineQuotes.map(comparison => {
             const quote = quotesById.get(comparison.quoteId);
             if (!quote) return null;
             const targetCodes = comparison.budgetLineCodes.join(', ');
             return <div className="quote-note" key={quote.id} data-testid={`comparison-line-${line.code}-${quote.id}`}>
               <div><a href={quote.driveUrl || quote.sourceUrl} target="_blank" rel="noreferrer">{quote.fileName}</a>{comparison.lowest && <strong> · lowest</strong>}</div>
               <div>CSV total for {targetCodes}: {preciseCurrency(comparison.csvTotal, currencyCode)} · Quote: {preciseCurrency(quote.amount, currencyCode)}</div>
               <div>Difference: {preciseCurrency(comparison.difference, currencyCode)} · {comparison.differencePercent == null ? '—' : `${comparison.differencePercent.toFixed(2)}%`}</div>
               <div>{quote.priceScope} · {titleCase(quote.scopeType)} · VAT {titleCase(quote.vatIncluded)} · Valid until {shortDate(quote.validityDate)}</div>
               <QuoteWarningLabels warnings={comparison.warnings}/>
             </div>;
           })}</td>
           <td>{line.unit || '—'}</td>
           <td className="money-cell">{line.quantity ?? '—'}</td>
           <td className="material-scenario"><small>Unit: {currency(line.ecoUnitPrice, currencyCode)} / {line.unit || 'unit'}</small><strong>Total: {currency(line.ecoTotal, currencyCode)}</strong></td>
           <td className="material-scenario"><small>Unit: {currency(line.standardUnitPrice, currencyCode)} / {line.unit || 'unit'}</small><strong>Total: {currency(line.standardTotal, currencyCode)}</strong></td>
           <td className="material-scenario"><small>Unit: {currency(line.premiumUnitPrice, currencyCode)} / {line.unit || 'unit'}</small><strong>Total: {currency(line.premiumTotal, currencyCode)}</strong></td>
           <td><div className="row-actions"><button className="icon-button small" title="Edit material" aria-label={`Edit ${line.code || line.item}`} onClick={() => setEditing(line)}><Pencil size={14}/></button><button className="icon-button small danger-hover" title="Remove material" aria-label={`Remove ${line.item}`} onClick={() => confirmDelete(line)}><Trash2 size={14}/></button></div></td>
         </tr>;
       })}
      {!filtered.length && <tr><td colSpan={10}><EmptyState icon={ClipboardList} title={lines.length ? 'No matching materials' : 'Master map is ready'} body={lines.length ? 'Try another code or chapter.' : 'Import the master quantity CSV to populate the materials map.'} action={!lines.length ? <button className="text-link" onClick={() => setImportOpen(true)}>Import master CSV <ArrowRight size={14}/></button> : undefined}/></td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>Showing {filtered.length} of {lines.length} materials</span><span><span className="footer-dot"/>Master source retained</span></div>
    </section>
    <section className="panel register-panel">
      <div className="register-toolbar"><strong>Extras</strong><span className="source-ref">Unit price is the total for one complete item.</span></div>
      {extrasQuery.isLoading ? <div className="table-footer">Loading extras…</div> : extrasQuery.isError ? <div className="inline-message"><AlertCircle size={15}/>Could not load extras.<button className="text-link" onClick={() => void extrasQuery.refetch()}>Retry</button></div> : <div className="table-scroll scrollbar-thin"><table className="data-table">
         <thead><tr><th>EXTRA</th><th>PACKS</th><th>QTY</th><th>UNIT</th><th>PRICE SCOPE</th><th>UNIT PRICE · COMPLETE ITEM</th><th>PRICE STATUS</th><th>NOTES</th><th>LINKED QUOTES</th><th/></tr></thead>
        <tbody>{(extrasQuery.data || []).map(extra => {
          const draft = draftForExtra(extra);
          return <tr key={extra.id} data-testid={`row-extra-${extra.id}`}>
            <td><strong data-testid={`text-extra-name-${extra.id}`}>{extra.name}</strong></td>
            <td><div className="row-actions">{extra.inEco && <span className="pill" data-testid={`flag-extra-eco-${extra.id}`}><i/>Eco</span>}{extra.inPremium && <span className="pill" data-testid={`flag-extra-premium-${extra.id}`}><i/>Premium</span>}</div></td>
            <td><label className="form-field"><input aria-label={`${extra.name} quantity`} data-testid={`input-extra-quantity-${extra.id}`} type="number" min="0" step="1" value={draft.quantity} disabled={updateExtra.isPending} onChange={event => changeExtraDraft(extra, { quantity: event.target.value })}/></label></td>
            <td data-testid={`text-extra-unit-${extra.id}`}>{extra.unit}</td>
            <td data-testid={`text-extra-price-scope-${extra.id}`}>{extra.priceScope}</td>
            <td><label className="form-field"><input aria-label={`${extra.name} complete item price`} data-testid={`input-extra-unit-price-${extra.id}`} type="number" min="0" step="0.01" placeholder="—" value={draft.unitPrice} disabled={updateExtra.isPending} onChange={event => changeExtraDraft(extra, { unitPrice: event.target.value })}/></label>{extra.unitPrice == null && !draft.unitPrice.trim() && <small className="source-ref" data-testid={`status-extra-price-pending-${extra.id}`}>Price pending</small>}</td>
            <td><label className="form-field"><select aria-label={`${extra.name} price status`} data-testid={`select-extra-status-${extra.id}`} value={draft.priceStatus} disabled={updateExtra.isPending} onChange={event => changeExtraDraft(extra, { priceStatus: event.target.value as BudgetExtra['priceStatus'] })}>{(['estimate', 'quoted', 'pending'] as BudgetExtra['priceStatus'][]).map(status => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label></td>
            <td><label className="form-field"><input aria-label={`${extra.name} notes`} data-testid={`input-extra-notes-${extra.id}`} value={draft.notes} disabled={updateExtra.isPending} onChange={event => changeExtraDraft(extra, { notes: event.target.value })}/></label></td>
           <td>{quoteComparisons.filter(comparison => comparison.extraIds.includes(extra.id)).map(comparison => {
             const quote = quotesById.get(comparison.quoteId);
             if (!quote) return null;
             return <div className="quote-note" key={quote.id} data-testid={`comparison-extra-${extra.id}-${quote.id}`}>
               <div><a href={quote.driveUrl || quote.sourceUrl} target="_blank" rel="noreferrer">{quote.fileName}</a>{comparison.lowest && <strong> · lowest</strong>}</div>
               <div>{preciseCurrency(quote.amount, currencyCode)} · {quote.priceScope} · {titleCase(quote.scopeType)} · VAT {titleCase(quote.vatIncluded)}</div>
               <div>Valid until {shortDate(quote.validityDate)}</div>
               <QuoteWarningLabels warnings={comparison.warnings}/>
               <button className="button button-secondary" data-testid={`button-use-quote-price-${extra.id}-${quote.id}`} disabled={updateExtra.isPending || quote.amount == null} onClick={() => useQuotePrice(extra, quote)}>Use quote price</button>
             </div>;
           })}</td>
            <td><button className="button button-secondary" data-testid={`button-save-extra-${extra.id}`} disabled={updateExtra.isPending} onClick={() => saveExtra(extra)}>Save</button></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>
    <div className="data-footnote"><CircleHelp size={14}/> The CSV has no currency field; amounts are formatted in the selected display currency without conversion. A source value of 0 is preserved and is not interpreted as a free item.</div>
    <Dialog open={createOpen || !!editing} title={editing ? 'Edit material' : 'Add material'} subtitle="Keep the source code, quantities, and three scenarios together." onClose={() => { setCreateOpen(false); setEditing(null); }}>
      <form className="form-grid" onSubmit={e => save(e, editing || undefined)}>
        <Field label="Code"><input required name="code" readOnly={!!editing} defaultValue={editing?.code || ''} placeholder="e.g. 1.1"/></Field><Field label="Unit"><input required name="unit" defaultValue={editing?.unit || ''} placeholder="m2, ml, un…"/></Field>
        <Field label="Chapter" wide><input required name="category" defaultValue={editing?.category || ''} placeholder="CAP. 1 Terraplenagens"/></Field><Field label="Description" wide><input required name="item" defaultValue={editing?.item || ''} placeholder="Material or work description"/></Field>
        <Field label="Quantity"><input required min="0" type="number" step="0.001" name="quantity" defaultValue={editing?.quantity ?? ''}/></Field>
        <Field label="Eco unit price"><input min="0" type="number" step="0.01" name="ecoUnitPrice" defaultValue={editing?.ecoUnitPrice ?? ''}/></Field><Field label="Eco total"><input min="0" type="number" step="0.01" name="ecoTotal" defaultValue={editing?.ecoTotal ?? ''}/></Field>
        <Field label="Standard unit price"><input min="0" type="number" step="0.01" name="standardUnitPrice" defaultValue={editing?.standardUnitPrice ?? ''}/></Field><Field label="Standard total"><input min="0" type="number" step="0.01" name="standardTotal" defaultValue={editing?.standardTotal ?? ''}/></Field>
        <Field label="Premium unit price"><input min="0" type="number" step="0.01" name="premiumUnitPrice" defaultValue={editing?.premiumUnitPrice ?? ''}/></Field><Field label="Premium total"><input min="0" type="number" step="0.01" name="premiumTotal" defaultValue={editing?.premiumTotal ?? ''}/></Field>
        <Field label="Source note" wide><textarea name="sourceNote" rows={2} defaultValue={editing?.sourceNote || ''} placeholder="Source context"/></Field>
        <FormActions onCancel={() => { setCreateOpen(false); setEditing(null); }} pending={create.isPending || update.isPending} label={editing ? 'Save material' : 'Add material'}/>
      </form>
    </Dialog>
    <Dialog open={importOpen} title="Import master quantity CSV" subtitle="Uses the source file's semicolon delimiter and Portuguese column headings." onClose={() => setImportOpen(false)}>
      <form onSubmit={importRows} className="import-form"><Field label="Choose CSV file" wide><input type="file" accept=".csv,text/csv" data-testid="input-budget-csv" onChange={event => { const file = event.target.files?.[0]; if (file) void file.text().then(setImportText).catch(() => setMessage('Could not read that file.')); }}/></Field><Field label="Or paste CSV rows" wide><textarea rows={8} value={importText} onChange={e => setImportText(e.target.value)} placeholder="Código;Capítulo;Descrição;Und.;Quant.;Preço Std;Total Std;Preço Eco;Total Eco;Preço Premium;Total Premium"/></Field><div className="import-tip"><FileSpreadsheet size={15}/> Existing codes are intended to update the corresponding material row.</div><FormActions onCancel={() => setImportOpen(false)} pending={importer.isPending} label="Import materials"/></form>
    </Dialog>
  </div>;
}

function QuotesPage() {
  const query = useGetBudgetQuotes();
  const linksQuery = useGetBudgetQuoteLinks();
  const linesQuery = useGetBudgetLines();
  const extrasQuery = useGetBudgetExtras();
  const projects = useGetBudgetProjects();
  const dashboard = useGetBudgetDashboard();
  const client = useQueryClient();
  const { currencyCode } = useCurrency();
  const create = useCreateBudgetQuote();
  const update = useUpdateBudgetQuote();
  const updateLinks = useUpdateBudgetQuoteLinks();
  const remove = useDeleteBudgetQuote();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<BudgetQuote | null>(null);
  const [message, setMessage] = useState('');
  const [selectedLineCodes, setSelectedLineCodes] = useState<string[]>([]);
  const [selectedExtraIds, setSelectedExtraIds] = useState<string[]>([]);
  const quotes = query.data || [];
  const links = linksQuery.data || [];
  const lines = linesQuery.data || [];
  const extras = extrasQuery.data || [];
  const filtered = useMemo(
    () => quotes.filter(q => (filter === 'all' || q.status === filter) && `${q.fileName} ${q.vendor || ''} ${q.category} ${q.buildingType || ''}`.toLowerCase().includes(search.toLowerCase())),
    [quotes, filter, search],
  );
  const quoteComparisons = useMemo(() => calculateQuoteComparisons(
    quotes,
    links,
    lines.map(line => ({ code: line.code, standardTotal: line.standardTotal })),
    localDateString(),
  ), [quotes, links, lines]);
  const quoteComparisonById = new Map(quoteComparisons.map(comparison => [comparison.quoteId, comparison]));
  const linksByQuote = new Map<string, BudgetQuoteLink[]>();
  for (const link of links) {
    const current = linksByQuote.get(link.quoteId) || [];
    current.push(link);
    linksByQuote.set(link.quoteId, current);
  }
  const reload = () => {
    void query.refetch();
    void linksQuery.refetch();
    void linesQuery.refetch();
    void extrasQuery.refetch();
    void dashboard.refetch();
  };
  const closeDialog = () => {
    setDialog(false);
    setEditing(null);
    setSelectedLineCodes([]);
    setSelectedExtraIds([]);
  };
  const openCreate = () => {
    setEditing(null);
    setSelectedLineCodes([]);
    setSelectedExtraIds([]);
    setDialog(true);
  };
  const openEdit = (quote: BudgetQuote) => {
    setEditing(quote);
    const quoteLinks = linksByQuote.get(quote.id) || [];
    setSelectedLineCodes(quoteLinks.flatMap(link => link.budgetLineCode ? [link.budgetLineCode] : []));
    setSelectedExtraIds(quoteLinks.flatMap(link => link.extraId ? [link.extraId] : []));
    setDialog(true);
  };
  const finishQuoteSave = (savedQuote: BudgetQuote, wasEditing: boolean) => {
    const quoteTargets = [
      ...selectedLineCodes.map(budgetLineCode => ({ budgetLineCode, extraId: null })),
      ...selectedExtraIds.map(extraId => ({ budgetLineCode: null, extraId })),
    ];
    updateLinks.mutate({ quoteId: savedQuote.id, data: { links: quoteTargets } }, {
      onSuccess: () => {
        closeDialog();
        setMessage(wasEditing ? 'Quote details and links saved.' : 'Quote added with its links.');
        void client.invalidateQueries({ queryKey: getGetBudgetQuotesQueryKey() });
        void client.invalidateQueries({ queryKey: getGetBudgetQuoteLinksQueryKey() });
        void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() });
      },
      onError: () => {
        setMessage('Quote details saved, but its line and extra links could not be saved.');
        void client.invalidateQueries({ queryKey: getGetBudgetQuotesQueryKey() });
      },
    });
  };
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (key: string) => String(fd.get(key) || '').trim();
    const amountText = val('amount');
    const payload: BudgetQuoteInput = {
      fileName: val('fileName'),
      category: val('category'),
      vendor: val('vendor') || null,
      documentType: val('documentType') as BudgetQuoteInput['documentType'],
      status: val('status') as BudgetQuoteInput['status'],
      amount: amountText ? Number(amountText) : null,
      priceScope: val('priceScope') || 'per house unit',
      scopeType: val('scopeType') as BudgetQuoteInput['scopeType'],
      vatIncluded: val('vatIncluded') as BudgetQuoteInput['vatIncluded'],
      validityDate: val('validityDate') || null,
      driveUrl: val('driveUrl') || null,
      buildingType: val('buildingType') || null,
      modifiedAt: val('modifiedAt') || null,
      sourceUrl: val('sourceUrl'),
      sourceFolderUrl: val('sourceFolderUrl') || null,
      note: val('note') || null,
    };
    if (editing) {
      update.mutate({ quoteId: editing.id, data: payload }, {
        onSuccess: savedQuote => finishQuoteSave(savedQuote, true),
      });
    } else {
      create.mutate({ data: payload }, {
        onSuccess: savedQuote => finishQuoteSave(savedQuote, false),
      });
    }
  };
  const deleteQuote = (quote: BudgetQuote) => {
    if (!window.confirm(`Remove “${quote.fileName}” from document review?`)) return;
    remove.mutate({ quoteId: quote.id }, {
      onSuccess: () => {
        setMessage('Document removed.');
        void client.invalidateQueries({ queryKey: getGetBudgetQuotesQueryKey() });
        void client.invalidateQueries({ queryKey: getGetBudgetQuoteLinksQueryKey() });
        void client.invalidateQueries({ queryKey: getGetBudgetExtrasQueryKey() });
        void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() });
      },
    });
  };
  if (query.isLoading || linksQuery.isLoading || linesQuery.isLoading || extrasQuery.isLoading) return <LoadingBlock/>;
  if (query.isError || linksQuery.isError || linesQuery.isError || extrasQuery.isError) return <ErrorBlock onRetry={reload}/>;
  return <div>
    <PageHeader eyebrow="WORKSPACE / DOCUMENT REVIEW" title="Quotes & documents" description="Review supplier proposals alongside the source file and folder they came from." action={<button className="button button-primary" onClick={openCreate}><Plus size={16}/> Add document</button>}/>
    <div className="review-banner"><div className="review-banner-icon"><FileCheck2 size={19}/></div><div><strong>{dashboard.data?.quotesNeedingReview ?? quotes.filter(q => q.status === 'needs_review').length} documents need a closer look</strong><span>Check the linked proposal and enter its price before relying on the record.</span></div><div className="banner-count">{quotes.length.toString().padStart(2, '0')}<small>FILES</small></div></div>
    {message && <div className="inline-message"><Check size={15}/>{message}<button onClick={() => setMessage('')} aria-label="Dismiss message"><X size={14}/></button></div>}
    <section className="panel quotes-panel">
      <div className="register-toolbar"><div className="search-box"><Search size={16}/><input aria-label="Search documents" placeholder="Search file, supplier, category…" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="toolbar-controls"><SlidersHorizontal size={15}/><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter quote status"><option value="all">All statuses</option>{quoteStatuses.map(status => <option key={status} value={status}>{titleCase(status)}</option>)}</select><button className="icon-button" title="Refresh" onClick={reload}><RefreshCw size={16}/></button></div></div>
      <div className="quote-list">
        {filtered.map((quote, index) => {
          const comparison = quoteComparisonById.get(quote.id);
          const quoteLinks = linksByQuote.get(quote.id) || [];
          const linkedNames = quoteLinks.map(link => {
            if (link.budgetLineCode) {
              const line = lines.find(item => item.code === link.budgetLineCode);
              return line ? `${line.code} · ${line.item}` : link.budgetLineCode;
            }
            const extra = extras.find(item => item.id === link.extraId);
            return extra?.name || 'Unknown extra';
          });
          const driveUrl = quote.driveUrl || quote.sourceUrl;
          return <article key={quote.id} className={`quote-row fade-up ${quote.status === 'needs_review' ? 'quote-needs-review' : ''}`} style={{ animationDelay: `${index * 35}ms` }} data-testid={`card-quote-${quote.id}`}>
            <div className="file-icon"><FileText size={19}/><span>{quote.documentType === 'proposal' ? 'PDF' : quote.documentType.slice(0,3).toUpperCase()}</span></div>
            <div className="quote-details">
              <div className="quote-title-line"><h3>{quote.fileName}</h3><StatusPill kind="quote" value={quote.status}/></div>
              <div className="quote-meta"><span>{quote.vendor || 'Vendor not identified'}</span><i/><span>{quote.category}</span>{quote.buildingType && <><i/><span>{quote.buildingType}</span></>}</div>
              <div className="quote-note">{quote.note || 'No review note added.'}</div>
              <div className="quote-note">{quote.priceScope} · {titleCase(quote.scopeType)} · VAT {titleCase(quote.vatIncluded)} · Valid until {shortDate(quote.validityDate)}</div>
              {linkedNames.length > 0 && <div className="quote-note">Linked to: {linkedNames.join(' · ')}</div>}
              {comparison && <div className="quote-note"><QuoteWarningLabels warnings={comparison.warnings}/>{comparison.lowest && <strong>Lowest</strong>}</div>}
              <div className="source-actions"><a href={driveUrl} target="_blank" rel="noreferrer" className="source-action"><ExternalLink size={13}/> Open in Drive</a>{quote.sourceFolderUrl && <a href={quote.sourceFolderUrl} target="_blank" rel="noreferrer" className="source-action"><Folder size={13}/> Parent folder</a>}</div>
            </div>
            <div className="quote-amount"><small>AMOUNT</small><strong>{currency(quote.amount, currencyCode)}</strong><span>Modified {shortDate(quote.modifiedAt)}</span></div>
            <div className="quote-controls"><button className="button button-quiet" onClick={() => openEdit(quote)}><Pencil size={14}/> Review</button><button className="icon-button small danger-hover" title="Remove document" aria-label={`Remove ${quote.fileName}`} onClick={() => deleteQuote(quote)}><Trash2 size={14}/></button></div>
          </article>;
        })}
        {!filtered.length && <EmptyState icon={FileCheck2} title={quotes.length ? 'No matching documents' : 'No supplier documents linked'} body={quotes.length ? 'Adjust your search or status filter.' : 'Add a proposal or estimate to connect it with the project register.'} action={!quotes.length ? <button className="button button-primary" onClick={openCreate}><Plus size={15}/> Add a document</button> : undefined}/>}
      </div>
      <div className="table-footer"><span>{filtered.length} documents</span><span>Linked source URLs open in a new tab</span></div>
    </section>
    <div className="data-footnote"><ShieldCheck size={14}/> Proposal prices are entered by hand; PDF contents are not read by the app.</div>
    <Dialog open={dialog} title={editing ? 'Review document details' : 'Add a source document'} subtitle="Link the proposal to budget lines or extras and keep its review context in one place." onClose={closeDialog}>
      <form className="form-grid" onSubmit={save}>
        <Field label="File name"><input required name="fileName" defaultValue={editing?.fileName || ''} placeholder="Supplier proposal.pdf"/></Field><Field label="Category"><input required name="category" defaultValue={editing?.category || ''} placeholder="Work category"/></Field>
        <Field label="Vendor"><input name="vendor" defaultValue={editing?.vendor || ''} placeholder="Supplier name"/></Field><Field label="Document type"><select name="documentType" defaultValue={editing?.documentType || 'unknown'}>{documentTypes.map(type => <option key={type} value={type}>{titleCase(type)}</option>)}</select></Field>
        <Field label="Review status"><select name="status" defaultValue={editing?.status || 'needs_review'}>{quoteStatuses.map(status => <option key={status} value={status}>{titleCase(status)}</option>)}</select></Field><Field label="Amount"><input name="amount" type="number" step="0.01" defaultValue={editing?.amount ?? ''} placeholder="Not stated"/></Field>
        <Field label="Price scope"><input name="priceScope" defaultValue={editing?.priceScope || 'per house unit'}/></Field><Field label="Scope type"><select name="scopeType" defaultValue={editing?.scopeType || 'unknown'}><option value="supplied">Supplied</option><option value="installed">Installed</option><option value="unknown">Unknown</option></select></Field>
        <Field label="VAT included"><select name="vatIncluded" defaultValue={editing?.vatIncluded || 'unknown'}><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Unknown</option></select></Field><Field label="Validity date"><input name="validityDate" type="date" defaultValue={editing?.validityDate || ''}/></Field>
        <Field label="Building type"><select name="buildingType" defaultValue={editing?.buildingType || ''}><option value="">Not specified</option>{projects.data?.map(project => <option key={project.id} value={project.name}>{project.name}</option>)}</select></Field><Field label="Modified date"><input name="modifiedAt" type="date" defaultValue={editing?.modifiedAt?.slice(0,10) || ''}/></Field>
        <Field label="Source document URL" wide><input required type="url" name="sourceUrl" defaultValue={editing?.sourceUrl || ''} placeholder="https://drive.google.com/…"/></Field>
        <Field label="Drive file URL" wide><input type="url" name="driveUrl" defaultValue={editing?.driveUrl || ''} placeholder="Optional direct link from boxes"/></Field>
        <Field label="Source folder URL" wide><input type="url" name="sourceFolderUrl" defaultValue={editing?.sourceFolderUrl || ''} placeholder="Optional folder link"/></Field>
        <Field label="Review note" wide><textarea name="note" rows={3} defaultValue={editing?.note || ''} placeholder="What should the contractor confirm?"/></Field>
        <Field label="Linked budget lines" wide><select multiple size={6} aria-label="Linked budget lines" data-testid="select-quote-budget-lines" value={selectedLineCodes} disabled={linesQuery.isLoading || linesQuery.isError} onChange={event => setSelectedLineCodes(Array.from(event.currentTarget.selectedOptions, option => option.value))}>{lines.filter(line => line.code != null).map(line => <option key={line.id} value={line.code!}>{line.code} · {line.item}</option>)}</select><small>Use Ctrl or Command to select multiple lines.</small></Field>
        <Field label="Linked extras" wide><select multiple size={5} aria-label="Linked extras" data-testid="select-quote-extras" value={selectedExtraIds} disabled={extrasQuery.isLoading || extrasQuery.isError} onChange={event => setSelectedExtraIds(Array.from(event.currentTarget.selectedOptions, option => option.value))}>{extras.map(extra => <option key={extra.id} value={extra.id}>{extra.name}</option>)}</select><small>Use Ctrl or Command to select multiple extras.</small></Field>
        {(linesQuery.isError || extrasQuery.isError) && <div className="inline-message"><AlertCircle size={15}/>Could not load link targets.</div>}
        <FormActions onCancel={closeDialog} pending={create.isPending || update.isPending || updateLinks.isPending} label={editing ? 'Save review' : 'Add document'}/>
      </form>
    </Dialog>
  </div>;
}

function SourcesPage() {
  const sources = useGetBudgetSources(); const projects = useGetBudgetProjects(); const health = useHealthCheck();
  const checkConnection = useCheckBudgetSourceConnection();
  const [query, setQuery] = useState('');
  const [checkingSourceId, setCheckingSourceId] = useState<string | null>(null);
  const [checkErrors, setCheckErrors] = useState<Record<string, string>>({});
  const files = sources.data || []; const types = projects.data || [];
  if (sources.isLoading || projects.isLoading) return <LoadingBlock/>;
  if (sources.isError || projects.isError) return <ErrorBlock onRetry={() => { void sources.refetch(); void projects.refetch(); }}/>;
  const filtered = files.filter(f => `${f.name} ${f.note} ${f.sourceType}`.toLowerCase().includes(query.toLowerCase()));
  const sourceIcon = (type: string) => type === 'spreadsheet' || type.toLowerCase().includes('csv') ? FileSpreadsheet : type === 'folder' ? Folder : BookOpen;
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not checked';
  const checkSource = async (sourceId: string) => {
    setCheckingSourceId(sourceId);
    setCheckErrors(current => ({ ...current, [sourceId]: '' }));
    try {
      const result = await checkConnection.mutateAsync({ sourceId });
      setCheckErrors(current => ({ ...current, [sourceId]: result.error ?? '' }));
      void sources.refetch();
    } catch (error) {
      setCheckErrors(current => ({ ...current, [sourceId]: error instanceof Error ? error.message : 'Drive connection check failed.' }));
      void sources.refetch();
    } finally {
      setCheckingSourceId(null);
    }
  };
  return <div>
    <PageHeader eyebrow="WORKSPACE / TRACEABILITY" title="Sources & references" description="The master quantity map, supplier files from boxes, and separate architecture references." action={<span className="connected-label"><span className={`health-dot ${health.data?.status === 'ok' ? 'is-up' : ''}`}/> {health.data?.status === 'ok' ? 'App online' : 'App status'}</span>}/>
    <section className="source-hero"><div className="source-hero-copy"><div className="eyebrow">LINKED MATERIAL</div><h2>Good decisions<br/>start with <em>good sources.</em></h2><p>Open the original working documents whenever a number or assumption needs context.</p></div><div className="source-hero-graphic"><div className="folder-illustration"><div className="folder-tab"/><div className="folder-sheet sheet-one"/><div className="folder-sheet sheet-two"><span/><span/><span/></div><div className="folder-front"><div className="folder-emblem"><Link2 size={22}/></div></div></div><div className="source-orbit orbit-a"/><div className="source-orbit orbit-b"/><span className="orbit-node node-a"><FileSpreadsheet size={14}/></span><span className="orbit-node node-b"><FileText size={14}/></span></div></section>
    <div className="source-section-head"><div><div className="eyebrow">DRIVE LIBRARY</div><h2>Linked files & folders <span>{files.length.toString().padStart(2,'0')}</span></h2></div><div className="source-search"><Search size={15}/><input placeholder="Find a source…" aria-label="Search sources" value={query} onChange={e => setQuery(e.target.value)}/></div></div>
    <div className="source-grid">{filtered.map((source, i) => { const Icon = sourceIcon(source.sourceType); return <article className="source-card fade-up" style={{ animationDelay: `${i * 55}ms` }} key={source.id} data-testid={`card-source-${source.id}`}><div className="source-card-top"><span className="source-type-icon"><Icon size={18}/></span><span className="source-type">{titleCase(source.sourceType)}</span><a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.name}`} className="icon-button small"><ExternalLink size={14}/></a></div><h3>{source.name}</h3><p>{source.note || 'No additional notes provided.'}</p><div className="source-card-foot"><span><Link2 size={13}/> Linked source</span><a href={source.url} target="_blank" rel="noreferrer">Open in Drive <ArrowUpRight size={13}/></a></div><div className="source-card-foot"><span>Last checked: {formatDate(source.lastCheckedAt)}</span><span>Status: {source.status ? titleCase(source.status) : 'Not checked'}</span></div><button className="button button-secondary button-small" type="button" disabled={checkingSourceId !== null} onClick={() => { void checkSource(source.id); }}>{checkingSourceId === source.id ? 'Checking…' : 'Check connection'}</button>{(checkErrors[source.id] || source.status === 'error') && <p role="alert">{checkErrors[source.id] || 'Drive access failed on the last check.'}</p>}{source.sourceType === 'folder' && source.itemCount !== null && <details open><summary className="source-card-foot">{source.itemCount} direct children</summary><div className="building-list">{source.children.map((child, childIndex) => <div className="building-row" key={`${child.name}-${childIndex}`}><span className="building-index">{String(childIndex + 1).padStart(2, '0')}</span><div className="building-name"><strong>{child.name}</strong><span>{child.type} · {formatDate(child.modifiedTime)}</span></div></div>)}</div></details>}</article>; })}{!filtered.length && <EmptyState icon={Folder} title="No sources found" body={files.length ? 'Try another search phrase.' : 'Linked Drive files and folders will appear here when provided.'}/>}</div>
    <div className="building-head"><div><div className="eyebrow">REFERENCE INDEX</div><h2>Building types</h2><p>Architecture references remain separate from the CSV's Eco, Standard, and Premium price tiers.</p></div><span className="building-count">{types.length.toString().padStart(2,'0')} REFERENCES</span></div>
    <div className="building-list">{types.map((project, i) => <article className="building-row" key={project.id} data-testid={`row-building-type-${project.id}`}><span className="building-index">{String(i+1).padStart(2,'0')}</span><div className="building-symbol"><HardHat size={17}/></div><div className="building-name"><strong>{project.name}</strong><span>Building type reference</span></div><a href={project.sourceUrl} target="_blank" rel="noreferrer" className="button button-secondary button-small">Open reference <ExternalLink size={13}/></a></article>)}{!types.length && <EmptyState icon={BookOpen} title="No building types linked" body="The building-type index appears when project references are available."/>}</div>
    <div className="source-note"><ShieldCheck size={16}/><div><strong>Traceability stays intact</strong><span>Source names, URLs, and notes are displayed as provided. References are not modified here.</span></div></div>
  </div>;
}

function NotFound() {
  return <div className="not-found"><div className="eyebrow">404 / NOT IN THE PLANS</div><h1>This page isn’t<br/><em>on the drawing.</em></h1><p>The address may have changed or the page may no longer exist.</p><Link href="/" className="button button-primary"><ArrowLeft size={15}/> Back to overview</Link></div>;
}
function Router() {
  return <Switch><Route path="/" component={() => <Shell><Overview/></Shell>}/><Route path="/budget" component={() => <Shell><BudgetPage/></Shell>}/><Route path="/planner" component={PlannerRoute}/><Route path="/quotes" component={() => <Shell><QuotesPage/></Shell>}/><Route path="/sources" component={() => <Shell><SourcesPage/></Shell>}/><Route component={() => <Shell><NotFound/></Shell>}/></Switch>;
}
function PlannerRoute() {
  const { currencyCode } = useCurrency();
  return <Shell><PlannerPage currencyCode={currencyCode}/></Shell>;
}
function App() {
  return <CurrencyProvider><QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router/></WouterRouter></QueryClientProvider></CurrencyProvider>;
}
export default App;
