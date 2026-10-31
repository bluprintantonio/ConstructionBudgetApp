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
  BudgetLine, BudgetQuote, BudgetLineInput, BudgetQuoteInput,
  BudgetLineStatus, BudgetLineReviewStatus, BudgetQuoteStatus, BudgetQuoteDocumentType,
  useHealthCheck, useGetBudgetDashboard, useGetBudgetProjects, useGetBudgetSources,
  useGetBudgetLines, useGetBudgetQuotes, useCreateBudgetLine, useImportBudgetLines,
  useUpdateBudgetLine, useDeleteBudgetLine, useCreateBudgetQuote, useUpdateBudgetQuote,
  useDeleteBudgetQuote, getGetBudgetDashboardQueryKey, getGetBudgetLinesQueryKey,
  getGetBudgetQuotesQueryKey
} from '@workspace/api-client-react';

const queryClient = new QueryClient();
const lineStatuses = Object.values(BudgetLineStatus);
const reviewStatuses = Object.values(BudgetLineReviewStatus);
const quoteStatuses = Object.values(BudgetQuoteStatus);
const documentTypes = Object.values(BudgetQuoteDocumentType);
const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/budget', label: 'Budget lines', icon: ClipboardList },
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

function parseCsvRows(input: string): string[][] {
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
    } else if (char === ',') {
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
  if (rows.length < 2) throw new Error('Add a header and at least one data row.');
  const normalize = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const headers = rows[0].map(normalize);
  const get = (row: string[], name: string) => {
    const index = headers.indexOf(normalize(name));
    return index < 0 ? '' : (row[index] || '').trim();
  };
  if (!headers.includes('category') || !headers.includes('item')) {
    throw new Error('CSV needs category and item columns. Export a template from Budget lines first.');
  }
  const numeric = (value: string) => {
    if (!value) return null;
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
    return parsed;
  };
  return rows.slice(1).map((row, index) => {
    const category = get(row, 'category');
    const item = get(row, 'item');
    if (!category || !item) throw new Error(`Row ${index + 2} needs both category and item.`);
    const status = get(row, 'status') || 'needs_review';
    const reviewStatus = get(row, 'reviewStatus') || 'unreviewed';
    if (!lineStatuses.includes(status as (typeof lineStatuses)[number])) throw new Error(`Row ${index + 2} has an unknown status.`);
    if (!reviewStatuses.includes(reviewStatus as (typeof reviewStatuses)[number])) throw new Error(`Row ${index + 2} has an unknown review status.`);
    return {
      category,
      item,
      buildingType: get(row, 'buildingType') || null,
      vendor: get(row, 'vendor') || null,
      receitas: numeric(get(row, 'receitas')),
      balanco: numeric(get(row, 'balanco')),
      investimento: numeric(get(row, 'investimento')),
      despesas: numeric(get(row, 'despesas')),
      quoteAmount: numeric(get(row, 'quoteAmount')),
      status: status as BudgetLineInput['status'],
      reviewStatus: reviewStatus as BudgetLineInput['reviewStatus'],
      sourceRow: numeric(get(row, 'sourceRow')),
      sourceNote: get(row, 'sourceNote') || null,
    };
  });
}

function downloadBudgetCsv(lines: BudgetLine[]) {
  const columns: (keyof BudgetLine)[] = [
    'category', 'item', 'buildingType', 'vendor', 'receitas', 'balanco',
    'investimento', 'despesas', 'quoteAmount', 'status', 'reviewStatus',
    'sourceRow', 'sourceNote',
  ];
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const csv = [columns.map(escape).join(','), ...lines.map(line => columns.map(key => escape(line[key])).join(','))].join('\r\n');
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = 'construction-budget-lines.csv';
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
        <div className="help-content"><p><strong>Budget lines</strong> hold editable project entries and the source row when provided.</p><p><strong>Quotes & documents</strong> keep supplier details beside the linked proposal or folder.</p><p><strong>Sources</strong> show original Drive locations and building-type references without changing them.</p><div className="import-tip"><ShieldCheck size={15}/> Original source metric labels are preserved exactly as received.</div><div className="form-actions"><button className="button button-primary" onClick={() => setHelpOpen(false)}>Got it <Check size={15}/></button></div></div>
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

function MetricTile({ label, value, sourceColumn, icon: Icon, index, currencyCode }: { label: string; value: number; sourceColumn: string; icon: typeof Activity; index: number; currencyCode: CurrencyCode }) {
  return <article className="metric-tile fade-up" style={{ animationDelay: `${index * 60}ms` }}>
    <div className="metric-top"><span className="metric-icon"><Icon size={17}/></span><span className="source-col">{sourceColumn}</span></div>
    <div className="metric-value">{currency(value, currencyCode)}</div><div className="metric-label">{label}</div>
    <div className="metric-foot"><span>Pipeline sheet value</span><ArrowUpRight size={14}/></div>
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
    .sort((a, b) => {
      const filled = (line: BudgetLine) => [line.receitas, line.balanco, line.investimento, line.despesas, line.quoteAmount].filter(value => value != null).length;
      return filled(b) - filled(a);
    })
    .slice(0, 5);
  if (dashboard.isLoading || lines.isLoading || quotes.isLoading) return <LoadingBlock/>;
  if (dashboard.isError || lines.isError || quotes.isError) return <ErrorBlock onRetry={() => { void dashboard.refetch(); void lines.refetch(); void quotes.refetch(); }}/>;
  const metrics = dashboard.data?.sourceMetrics || [];
  return <div>
    <PageHeader eyebrow="PROJECT CONTROL / 01" title="Project overview" description="A clear view of the numbers, proposals, and references behind your build." action={<button className="button button-secondary" onClick={() => { void client.invalidateQueries(); }}><RefreshCw size={15}/> Refresh data</button>}/>
    <section className="welcome-band">
      <div className="welcome-copy"><span className="welcome-tag"><span/> PROJECT WORKSPACE</span><h2>Build with the<br/><em>whole picture.</em></h2><p>Budget lines, supplier proposals, and source documents — connected and ready to review together.</p>
        <div className="welcome-actions"><Link href="/budget" className="button button-light">Review budget <ArrowRight size={15}/></Link><Link href="/quotes" className="welcome-link">Open proposals <ArrowUpRight size={15}/></Link></div>
      </div>
      <div className="welcome-art" aria-hidden="true"><div className="art-grid"/><div className="blueprint"><div className="bp-topline"/><div className="bp-room bp-a"/><div className="bp-room bp-b"/><div className="bp-room bp-c"/><div className="bp-room bp-d"/><div className="bp-label">GROUND FLOOR / 01</div><div className="bp-dimension">NTS</div></div><div className="art-stamp">H<br/><span>PLAN SET</span></div><div className="art-coordinate">REFERENCE / A-01<br/>PROJECT DRAWING</div></div>
    </section>
    <div className="section-heading"><div><div className="eyebrow">SOURCE SHEET SNAPSHOT</div><h2>Numbers, as supplied</h2><p className="currency-assumption">Display currency: {currencyCode} (assumed; values are not converted).</p></div><div className="section-meta"><span className={`health-dot ${health.data?.status === 'ok' ? 'is-up' : ''}`}/>{health.data?.status === 'ok' ? 'App online' : 'Source metrics'}</div></div>
    {metrics.length ? <div className="metrics-grid">{metrics.map((metric, i) => <MetricTile key={metric.id} {...metric} icon={[Landmark, Activity, ArrowDownRight, FileSpreadsheet][i % 4]} index={i} currencyCode={currencyCode}/>)}</div> : <div className="metric-placeholder"><FileSpreadsheet size={19}/><span>Source sheet metrics will appear here when available.</span></div>}
    <div className="dashboard-lower">
      <section className="panel recent-panel"><div className="panel-head"><div><div className="eyebrow">BUDGET REGISTER</div><h2>Source entries</h2></div><Link href="/budget" className="text-link">View all <ArrowRight size={14}/></Link></div>
        {recentLines.length ? <div className="compact-list">{recentLines.map(line => <div className="compact-row" key={line.id} data-testid={`row-overview-line-${line.id}`}><div className="category-mark">{line.category.slice(0,1).toUpperCase()}</div><div className="compact-main"><strong>{line.item}</strong><span>{line.category}{line.vendor ? ` · ${line.vendor}` : ''}</span></div><div className="compact-end"><strong>{currency(line.quoteAmount, currencyCode)}</strong><StatusPill value={line.status}/></div></div>)}</div> : <EmptyState icon={ClipboardList} title="No budget lines yet" body="Add or import lines to start building a reviewable register." action={<Link href="/budget" className="text-link">Go to budget <ArrowRight size={14}/></Link>}/>}
      </section>
      <aside className="side-summary">
        <div className="summary-head"><div className="eyebrow">REVIEW QUEUE</div><span className="summary-mark"><CheckCircle2 size={17}/></span></div>
        <div className="summary-number">{(dashboard.data?.linesNeedingReview || 0) + (dashboard.data?.quotesNeedingReview || 0)}</div><h3>Items to look over</h3><p>Unconfirmed details gathered from your source documents.</p>
        <div className="queue-row"><span>Budget lines</span><b>{dashboard.data?.linesNeedingReview ?? 0}</b></div><div className="queue-row"><span>Supplier documents</span><b>{dashboard.data?.quotesNeedingReview ?? 0}</b></div>
        <Link href="/quotes" className="button button-primary full-button">Open review queue <ArrowRight size={15}/></Link>
        <div className="summary-divider"/>
        <div className="project-link"><div className="project-link-icon"><BookOpen size={16}/></div><div><small>BUILDING REFERENCES</small><strong>{projects.data?.length ?? 0} linked building types</strong></div><Link href="/sources" aria-label="View source references"><ArrowUpRight size={15}/></Link></div>
      </aside>
    </div>
    <div className="data-footnote"><ShieldCheck size={14}/> Source values retain their original labels. No budget-versus-actual interpretation is assumed.</div>
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

function BudgetPage() {
  const query = useGetBudgetLines(); const projects = useGetBudgetProjects(); const dashboard = useGetBudgetDashboard(); const client = useQueryClient();
  const { currencyCode } = useCurrency();
  const create = useCreateBudgetLine(); const update = useUpdateBudgetLine(); const remove = useDeleteBudgetLine(); const importer = useImportBudgetLines();
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all'); const [editing, setEditing] = useState<BudgetLine | null>(null); const [createOpen, setCreateOpen] = useState(false); const [importOpen, setImportOpen] = useState(false); const [importText, setImportText] = useState(''); const [message, setMessage] = useState('');
  const lines = query.data || [];
  const filtered = useMemo(() => lines.filter(l => (filter === 'all' || l.status === filter) && `${l.category} ${l.item} ${l.vendor || ''} ${l.buildingType || ''}`.toLowerCase().includes(search.toLowerCase())), [lines, filter, search]);
  const reload = () => { void query.refetch(); void dashboard.refetch(); };
  const save = (e: FormEvent<HTMLFormElement>, line?: BudgetLine) => {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    const numeric = (key: string) => fd.get(key) === '' ? null : Number(fd.get(key));
    const payload: BudgetLineInput = { category: String(fd.get('category') || ''), item: String(fd.get('item') || ''), buildingType: String(fd.get('buildingType') || '') || null, vendor: String(fd.get('vendor') || '') || null, receitas: numeric('receitas'), balanco: numeric('balanco'), investimento: numeric('investimento'), despesas: numeric('despesas'), quoteAmount: numeric('quoteAmount'), status: String(fd.get('status')) as BudgetLineInput['status'], reviewStatus: String(fd.get('reviewStatus')) as BudgetLineInput['reviewStatus'], sourceRow: numeric('sourceRow'), sourceNote: String(fd.get('sourceNote') || '') || null };
    const done = () => { setCreateOpen(false); setEditing(null); setMessage(line ? 'Budget line updated.' : 'Budget line added.'); void client.invalidateQueries({ queryKey: getGetBudgetLinesQueryKey() }); void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() }); };
    line ? update.mutate({ lineId: line.id, data: payload }, { onSuccess: done }) : create.mutate({ data: payload }, { onSuccess: done });
  };
  const confirmDelete = (line: BudgetLine) => { if (window.confirm(`Delete “${line.item}” from the budget register?`)) remove.mutate({ lineId: line.id }, { onSuccess: () => { setMessage('Budget line removed.'); void client.invalidateQueries({ queryKey: getGetBudgetLinesQueryKey() }); void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() }); } }); };
  const importRows = (e: FormEvent) => { e.preventDefault(); try { const parsed = parseBudgetCsv(importText); importer.mutate({ data: parsed }, { onSuccess: () => { setImportOpen(false); setImportText(''); setMessage('CSV rows imported.'); void client.invalidateQueries({ queryKey: getGetBudgetLinesQueryKey() }); void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() }); }, onError: () => setMessage('The CSV could not be imported. Check the column headers and try again.') }); } catch (error) { setMessage(error instanceof Error ? error.message : 'CSV could not be read.'); } };
  if (query.isLoading) return <LoadingBlock/>; if (query.isError) return <ErrorBlock onRetry={reload}/>;
  return <div>
    <PageHeader eyebrow="WORKSPACE / REGISTER" title="Budget lines" description="Keep categories, supplier figures, and original sheet references together." action={<div className="heading-actions"><button className="button button-secondary" onClick={() => downloadBudgetCsv(lines)} disabled={!lines.length}><FileSpreadsheet size={15}/> Export CSV</button><button className="button button-secondary" onClick={() => setImportOpen(true)}><UploadCloud size={15}/> Import CSV</button><button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={16}/> Add line</button></div>}/>
    <div className="register-strip"><div className="register-stat"><strong>{dashboard.data?.lineCount ?? lines.length}</strong><span>REGISTERED LINES</span></div><div className="register-stat"><strong>{dashboard.data?.linesNeedingReview ?? 0}</strong><span>NEED REVIEW</span></div><div className="register-stat strip-note"><ShieldCheck size={17}/><span>Financial columns are shown with their original source names.</span></div></div>
    {message && <div className="inline-message"><Check size={15}/>{message}<button onClick={() => setMessage('')} aria-label="Dismiss message"><X size={14}/></button></div>}
    <section className="panel register-panel">
      <div className="register-toolbar"><div className="search-box"><Search size={16}/><input aria-label="Search budget lines" data-testid="input-search-budget-lines" placeholder="Search items, vendors, categories…" value={search} onChange={e => setSearch(e.target.value)}/><kbd>⌘ K</kbd></div><div className="toolbar-controls"><SlidersHorizontal size={15}/><select aria-label="Filter by status" value={filter} onChange={e => setFilter(e.target.value)} data-testid="select-budget-status"><option value="all">All statuses</option>{lineStatuses.map(s => <option value={s} key={s}>{titleCase(s)}</option>)}</select><button className="icon-button" title="Refresh" onClick={reload}><RefreshCw size={16}/></button></div></div>
      <div className="table-scroll scrollbar-thin"><table className="data-table budget-table"><thead><tr><th>LINE ITEM</th><th>BUILDING TYPE</th><th>VENDOR</th><th>RECEITAS</th><th>BALANÇO</th><th>INVESTIMENTO</th><th>DESPESAS</th><th>QUOTE</th><th>STATUS</th><th>SOURCE</th><th/></tr></thead><tbody>
      {filtered.map(line => <tr key={line.id} data-testid={`row-budget-line-${line.id}`}><td><div className="item-cell"><span className="line-marker"/><div><strong>{line.item}</strong><small>{line.category}</small></div></div></td><td>{line.buildingType || <span className="muted-dash">—</span>}</td><td>{line.vendor || <span className="muted-dash">—</span>}</td><td className="money-cell">{currency(line.receitas, currencyCode)}</td><td className="money-cell">{currency(line.balanco, currencyCode)}</td><td className="money-cell">{currency(line.investimento, currencyCode)}</td><td className="money-cell">{currency(line.despesas, currencyCode)}</td><td className="money-cell quote-money">{currency(line.quoteAmount, currencyCode)}</td><td><StatusPill value={line.status}/></td><td>{line.sourceRow ? <span className="source-ref"><FileSpreadsheet size={13}/> Row {line.sourceRow}</span> : <span className="muted-dash">—</span>}</td><td><div className="row-actions"><button className="icon-button small" title="Edit line" aria-label={`Edit ${line.item}`} onClick={() => setEditing(line)}><Pencil size={14}/></button><button className="icon-button small danger-hover" title="Delete line" aria-label={`Delete ${line.item}`} onClick={() => confirmDelete(line)}><Trash2 size={14}/></button></div></td></tr>)}
      {!filtered.length && <tr><td colSpan={11}><EmptyState icon={ClipboardList} title={lines.length ? 'No matching lines' : 'Your register is ready'} body={lines.length ? 'Try a different search or status filter.' : 'Add a line or import source records to begin.'} action={!lines.length ? <button className="text-link" onClick={() => setCreateOpen(true)}>Add the first line <ArrowRight size={14}/></button> : undefined}/></td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>Showing {filtered.length} of {lines.length} lines</span><span><span className="footer-dot"/>Source reference retained</span></div>
    </section>
    <div className="data-footnote"><CircleHelp size={14}/> Source columns remain distinct. Labels are not interpreted as budget, actual, or variance.</div>
    <Dialog open={createOpen || !!editing} title={editing ? 'Edit budget line' : 'Add a budget line'} subtitle="Keep the source values and review status traceable." onClose={() => { setCreateOpen(false); setEditing(null); }}>
      <form className="form-grid" onSubmit={e => save(e, editing || undefined)}>
        <Field label="Category"><input required name="category" defaultValue={editing?.category || ''} placeholder="e.g. Exterior works"/></Field><Field label="Line item"><input required name="item" defaultValue={editing?.item || ''} placeholder="Describe the work or material"/></Field>
        <Field label="Building type"><select name="buildingType" defaultValue={editing?.buildingType || ''}><option value="">Not specified</option>{projects.data?.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></Field><Field label="Vendor"><input name="vendor" defaultValue={editing?.vendor || ''} placeholder="Supplier or contractor"/></Field>
        {(['receitas','balanco','investimento','despesas','quoteAmount'] as const).map(k => <Field label={k === 'quoteAmount' ? 'Quote amount' : k.toUpperCase()} key={k}><input type="number" step="0.01" name={k} defaultValue={editing?.[k] ?? ''} placeholder="—"/></Field>)}
        <Field label="Line status"><select name="status" defaultValue={editing?.status || 'planned'}>{lineStatuses.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field><Field label="Review status"><select name="reviewStatus" defaultValue={editing?.reviewStatus || 'unreviewed'}>{reviewStatuses.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
        <Field label="Source row" ><input name="sourceRow" type="number" min="1" defaultValue={editing?.sourceRow ?? ''} placeholder="Row number, if known"/></Field><Field label="Source note"><input name="sourceNote" defaultValue={editing?.sourceNote || ''} placeholder="Context from the original sheet"/></Field>
        <FormActions onCancel={() => { setCreateOpen(false); setEditing(null); }} pending={create.isPending || update.isPending} label={editing ? 'Save changes' : 'Add line'}/>
      </form>
    </Dialog>
    <Dialog open={importOpen} title="Import budget CSV" subtitle="Use the exported headers so source fields remain in the right columns." onClose={() => setImportOpen(false)}>
      <form onSubmit={importRows} className="import-form"><Field label="Choose CSV file" wide><input type="file" accept=".csv,text/csv" data-testid="input-budget-csv" onChange={event => { const file = event.target.files?.[0]; if (file) void file.text().then(setImportText).catch(() => setMessage('Could not read that file.')); }}/></Field><Field label="Or paste CSV rows" wide><textarea rows={8} value={importText} onChange={e => setImportText(e.target.value)} placeholder="category,item,buildingType,vendor,receitas,balanco,investimento,despesas,quoteAmount,status,reviewStatus,sourceRow,sourceNote" /></Field><div className="import-tip"><FileSpreadsheet size={15}/> Required columns: category and item. Blank numeric fields stay empty.</div><FormActions onCancel={() => setImportOpen(false)} pending={importer.isPending} label="Import records"/></form>
    </Dialog>
  </div>;
}

function QuotesPage() {
  const query = useGetBudgetQuotes(); const projects = useGetBudgetProjects(); const dashboard = useGetBudgetDashboard(); const client = useQueryClient();
  const { currencyCode } = useCurrency();
  const create = useCreateBudgetQuote(); const update = useUpdateBudgetQuote(); const remove = useDeleteBudgetQuote();
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all'); const [dialog, setDialog] = useState(false); const [editing, setEditing] = useState<BudgetQuote | null>(null); const [message, setMessage] = useState('');
  const quotes = query.data || []; const filtered = useMemo(() => quotes.filter(q => (filter === 'all' || q.status === filter) && `${q.fileName} ${q.vendor || ''} ${q.category} ${q.buildingType || ''}`.toLowerCase().includes(search.toLowerCase())), [quotes, filter, search]);
  const reload = () => { void query.refetch(); void dashboard.refetch(); };
  const save = (e: FormEvent<HTMLFormElement>, quote?: BudgetQuote) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const val = (k: string) => String(fd.get(k) || ''); const amountText = val('amount');
    const payload: BudgetQuoteInput = { fileName: val('fileName'), category: val('category'), vendor: val('vendor') || null, documentType: val('documentType') as BudgetQuoteInput['documentType'], status: val('status') as BudgetQuoteInput['status'], amount: amountText ? Number(amountText) : null, buildingType: val('buildingType') || null, modifiedAt: val('modifiedAt') || null, sourceUrl: val('sourceUrl'), sourceFolderUrl: val('sourceFolderUrl') || null, note: val('note') || null };
    const done = () => { setDialog(false); setEditing(null); setMessage(quote ? 'Document details updated.' : 'Document added to review.'); void client.invalidateQueries({ queryKey: getGetBudgetQuotesQueryKey() }); void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() }); };
    quote ? update.mutate({ quoteId: quote.id, data: payload }, { onSuccess: done }) : create.mutate({ data: payload }, { onSuccess: done });
  };
  const deleteQuote = (q: BudgetQuote) => { if (window.confirm(`Remove “${q.fileName}” from document review?`)) remove.mutate({ quoteId: q.id }, { onSuccess: () => { setMessage('Document removed.'); void client.invalidateQueries({ queryKey: getGetBudgetQuotesQueryKey() }); void client.invalidateQueries({ queryKey: getGetBudgetDashboardQueryKey() }); } }); };
  if (query.isLoading) return <LoadingBlock/>; if (query.isError) return <ErrorBlock onRetry={reload}/>;
  return <div>
    <PageHeader eyebrow="WORKSPACE / DOCUMENT REVIEW" title="Quotes & documents" description="Review supplier proposals alongside the source file and folder they came from." action={<button className="button button-primary" onClick={() => { setEditing(null); setDialog(true); }}><Plus size={16}/> Add document</button>}/>
    <div className="review-banner"><div className="review-banner-icon"><FileCheck2 size={19}/></div><div><strong>{dashboard.data?.quotesNeedingReview ?? quotes.filter(q => q.status === 'needs_review').length} documents need a closer look</strong><span>Check the linked proposal and enter its price before relying on the record.</span></div><div className="banner-count">{quotes.length.toString().padStart(2, '0')}<small>FILES</small></div></div>
    {message && <div className="inline-message"><Check size={15}/>{message}<button onClick={() => setMessage('')} aria-label="Dismiss message"><X size={14}/></button></div>}
    <section className="panel quotes-panel">
      <div className="register-toolbar"><div className="search-box"><Search size={16}/><input aria-label="Search documents" placeholder="Search file, supplier, category…" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="toolbar-controls"><SlidersHorizontal size={15}/><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter quote status"><option value="all">All statuses</option>{quoteStatuses.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}</select><button className="icon-button" title="Refresh" onClick={reload}><RefreshCw size={16}/></button></div></div>
      <div className="quote-list">
        {filtered.map((q, i) => <article key={q.id} className={`quote-row fade-up ${q.status === 'needs_review' ? 'quote-needs-review' : ''}`} style={{ animationDelay: `${i * 35}ms` }} data-testid={`card-quote-${q.id}`}>
          <div className="file-icon"><FileText size={19}/><span>{q.documentType === 'proposal' ? 'PDF' : q.documentType.slice(0,3).toUpperCase()}</span></div>
          <div className="quote-details"><div className="quote-title-line"><h3>{q.fileName}</h3><StatusPill kind="quote" value={q.status}/></div><div className="quote-meta"><span>{q.vendor || 'Vendor not identified'}</span><i/> <span>{q.category}</span>{q.buildingType && <><i/><span>{q.buildingType}</span></>}</div><div className="quote-note">{q.note || 'No review note added.'}</div><div className="source-actions"><a href={q.sourceUrl} target="_blank" rel="noreferrer" className="source-action"><ExternalLink size={13}/> Open source document</a>{q.sourceFolderUrl && <a href={q.sourceFolderUrl} target="_blank" rel="noreferrer" className="source-action"><Folder size={13}/> Parent folder</a>}</div></div>
          <div className="quote-amount"><small>AMOUNT</small><strong>{currency(q.amount, currencyCode)}</strong><span>Modified {shortDate(q.modifiedAt)}</span></div>
          <div className="quote-controls"><button className="button button-quiet" onClick={() => { setEditing(q); setDialog(true); }}><Pencil size={14}/> Review</button><button className="icon-button small danger-hover" title="Remove document" aria-label={`Remove ${q.fileName}`} onClick={() => deleteQuote(q)}><Trash2 size={14}/></button></div>
        </article>)}
        {!filtered.length && <EmptyState icon={FileCheck2} title={quotes.length ? 'No matching documents' : 'No supplier documents linked'} body={quotes.length ? 'Adjust your search or status filter.' : 'Add a proposal or estimate to connect it with the project register.'} action={!quotes.length ? <button className="button button-primary" onClick={() => setDialog(true)}><Plus size={15}/> Add a document</button> : undefined}/>}
      </div>
      <div className="table-footer"><span>{filtered.length} documents</span><span>Linked source URLs open in a new tab</span></div>
    </section>
    <div className="data-footnote"><ShieldCheck size={14}/> Proposal prices have not been extracted from the PDFs. Enter amounts only after checking the linked source.</div>
    <Dialog open={dialog} title={editing ? 'Review document details' : 'Add a source document'} subtitle="Link the proposal and keep its review context in one place." onClose={() => { setDialog(false); setEditing(null); }}>
      <form className="form-grid" onSubmit={e => save(e, editing || undefined)}>
        <Field label="File name"><input required name="fileName" defaultValue={editing?.fileName || ''} placeholder="Supplier proposal.pdf"/></Field><Field label="Category"><input required name="category" defaultValue={editing?.category || ''} placeholder="Work category"/></Field>
        <Field label="Vendor"><input name="vendor" defaultValue={editing?.vendor || ''} placeholder="Supplier name"/></Field><Field label="Document type"><select name="documentType" defaultValue={editing?.documentType || 'unknown'}>{documentTypes.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
        <Field label="Review status"><select name="status" defaultValue={editing?.status || 'needs_review'}>{quoteStatuses.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field><Field label="Amount"><input name="amount" type="number" step="0.01" defaultValue={editing?.amount ?? ''} placeholder="Not stated"/></Field>
        <Field label="Building type"><select name="buildingType" defaultValue={editing?.buildingType || ''}><option value="">Not specified</option>{projects.data?.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></Field><Field label="Modified date"><input name="modifiedAt" type="date" defaultValue={editing?.modifiedAt?.slice(0,10) || ''}/></Field>
        <Field label="Source document URL" wide><input required type="url" name="sourceUrl" defaultValue={editing?.sourceUrl || ''} placeholder="https://drive.google.com/…"/></Field><Field label="Source folder URL" wide><input type="url" name="sourceFolderUrl" defaultValue={editing?.sourceFolderUrl || ''} placeholder="Optional folder link"/></Field><Field label="Review note" wide><textarea name="note" rows={3} defaultValue={editing?.note || ''} placeholder="What should the contractor confirm?"/></Field>
        <FormActions onCancel={() => { setDialog(false); setEditing(null); }} pending={create.isPending || update.isPending} label={editing ? 'Save review' : 'Add document'}/>
      </form>
    </Dialog>
  </div>;
}

function SourcesPage() {
  const sources = useGetBudgetSources(); const projects = useGetBudgetProjects(); const health = useHealthCheck();
  const [query, setQuery] = useState('');
  const files = sources.data || []; const types = projects.data || [];
  if (sources.isLoading || projects.isLoading) return <LoadingBlock/>;
  if (sources.isError || projects.isError) return <ErrorBlock onRetry={() => { void sources.refetch(); void projects.refetch(); }}/>;
  const filtered = files.filter(f => `${f.name} ${f.note} ${f.sourceType}`.toLowerCase().includes(query.toLowerCase()));
  const sourceIcon = (type: string) => type === 'spreadsheet' ? FileSpreadsheet : type === 'folder' ? Folder : BookOpen;
  return <div>
    <PageHeader eyebrow="WORKSPACE / TRACEABILITY" title="Sources & references" description="Drive links and building-type references behind this project." action={<span className="connected-label"><span className={`health-dot ${health.data?.status === 'ok' ? 'is-up' : ''}`}/> {health.data?.status === 'ok' ? 'App online' : 'App status'}</span>}/>
    <section className="source-hero"><div className="source-hero-copy"><div className="eyebrow">LINKED MATERIAL</div><h2>Good decisions<br/>start with <em>good sources.</em></h2><p>Open the original working documents whenever a number or assumption needs context.</p></div><div className="source-hero-graphic"><div className="folder-illustration"><div className="folder-tab"/><div className="folder-sheet sheet-one"/><div className="folder-sheet sheet-two"><span/><span/><span/></div><div className="folder-front"><div className="folder-emblem"><Link2 size={22}/></div></div></div><div className="source-orbit orbit-a"/><div className="source-orbit orbit-b"/><span className="orbit-node node-a"><FileSpreadsheet size={14}/></span><span className="orbit-node node-b"><FileText size={14}/></span></div></section>
    <div className="source-section-head"><div><div className="eyebrow">DRIVE LIBRARY</div><h2>Linked files & folders <span>{files.length.toString().padStart(2,'0')}</span></h2></div><div className="source-search"><Search size={15}/><input placeholder="Find a source…" aria-label="Search sources" value={query} onChange={e => setQuery(e.target.value)}/></div></div>
    <div className="source-grid">{filtered.map((source, i) => { const Icon = sourceIcon(source.sourceType); return <article className="source-card fade-up" style={{ animationDelay: `${i * 55}ms` }} key={source.id} data-testid={`card-source-${source.id}`}><div className="source-card-top"><span className="source-type-icon"><Icon size={18}/></span><span className="source-type">{titleCase(source.sourceType)}</span><a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.name}`} className="icon-button small"><ExternalLink size={14}/></a></div><h3>{source.name}</h3><p>{source.note || 'No additional notes provided.'}</p><div className="source-card-foot"><span><Link2 size={13}/> Linked source</span><a href={source.url} target="_blank" rel="noreferrer">Open in Drive <ArrowUpRight size={13}/></a></div></article>; })}{!filtered.length && <EmptyState icon={Folder} title="No sources found" body={files.length ? 'Try another search phrase.' : 'Linked Drive files and folders will appear here when provided.'}/>}</div>
    <div className="building-head"><div><div className="eyebrow">REFERENCE INDEX</div><h2>Building types</h2><p>Project references used to group and review related budget lines.</p></div><span className="building-count">{types.length.toString().padStart(2,'0')} REFERENCES</span></div>
    <div className="building-list">{types.map((project, i) => <article className="building-row" key={project.id} data-testid={`row-building-type-${project.id}`}><span className="building-index">{String(i+1).padStart(2,'0')}</span><div className="building-symbol"><HardHat size={17}/></div><div className="building-name"><strong>{project.name}</strong><span>Building type reference</span></div><a href={project.sourceUrl} target="_blank" rel="noreferrer" className="button button-secondary button-small">Open reference <ExternalLink size={13}/></a></article>)}{!types.length && <EmptyState icon={BookOpen} title="No building types linked" body="The building-type index appears when project references are available."/>}</div>
    <div className="source-note"><ShieldCheck size={16}/><div><strong>Traceability stays intact</strong><span>Source names, URLs, and notes are displayed as provided. References are not modified here.</span></div></div>
  </div>;
}

function NotFound() {
  return <div className="not-found"><div className="eyebrow">404 / NOT IN THE PLANS</div><h1>This page isn’t<br/><em>on the drawing.</em></h1><p>The address may have changed or the page may no longer exist.</p><Link href="/" className="button button-primary"><ArrowLeft size={15}/> Back to overview</Link></div>;
}
function Router() {
  return <Switch><Route path="/" component={() => <Shell><Overview/></Shell>}/><Route path="/budget" component={() => <Shell><BudgetPage/></Shell>}/><Route path="/quotes" component={() => <Shell><QuotesPage/></Shell>}/><Route path="/sources" component={() => <Shell><SourcesPage/></Shell>}/><Route component={() => <Shell><NotFound/></Shell>}/></Switch>;
}
function App() {
  return <CurrencyProvider><QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router/></WouterRouter></QueryClientProvider></CurrencyProvider>;
}
export default App;
