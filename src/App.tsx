import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Transaction,
  TransactionType,
  AssetClass,
  Portfolio,
  PortfolioSummary,
  PortfolioStats,
  computePortfolioStats,
  usePortfolioList,
  usePortfolio,
} from './portfolio';
import './App.css';

// ============================================================
// FORMATTING HELPERS
// ============================================================

function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  // Append T00:00:00 to avoid UTC-midnight shifting to the previous calendar day.
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatQuantity(quantity: number, ticker?: string): string {
  const isFractional = ticker === 'BTC' || ticker === 'ETH' || !Number.isInteger(quantity);
  if (isFractional) {
    return quantity.toLocaleString('en-US', { maximumFractionDigits: 8 });
  }
  return quantity.toLocaleString('en-US');
}

// ============================================================
// BADGE METADATA
// ============================================================

interface BadgeMeta {
  label: string;
  colorClass: string;
}

const TRANSACTION_TYPE_META: Record<TransactionType, BadgeMeta> = {
  BUY:          { label: 'Buy',          colorClass: 'badge-buy' },
  SELL:         { label: 'Sell',         colorClass: 'badge-sell' },
  DIVIDEND:     { label: 'Dividend',     colorClass: 'badge-dividend' },
  INTEREST:     { label: 'Interest',     colorClass: 'badge-interest' },
  DEPOSIT:      { label: 'Deposit',      colorClass: 'badge-deposit' },
  WITHDRAWAL:   { label: 'Withdrawal',   colorClass: 'badge-withdrawal' },
  FEE:          { label: 'Fee',          colorClass: 'badge-fee' },
  STOCK_SPLIT:  { label: 'Split',        colorClass: 'badge-split' },
  TRANSFER_IN:  { label: 'Transfer In',  colorClass: 'badge-transfer-in' },
  TRANSFER_OUT: { label: 'Transfer Out', colorClass: 'badge-transfer-out' },
};

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  EQUITY:      'Equity',
  BOND:        'Bond',
  ETF:         'ETF',
  MUTUAL_FUND: 'Fund',
  CRYPTO:      'Crypto',
  REAL_ESTATE: 'Real Estate',
  COMMODITY:   'Commodity',
  CASH:        'Cash',
};

// ============================================================
// LOADING SPINNER
// ============================================================

interface LoadingSpinnerProps {
  message?: string;
}

function LoadingSpinner({ message = 'Loading…' }: LoadingSpinnerProps): React.ReactElement {
  return (
    <div className="loading-container">
      <div className="spinner" aria-label="Loading" />
      <p className="loading-text">{message}</p>
    </div>
  );
}

// ============================================================
// ERROR BANNER
// ============================================================

interface ErrorBannerProps {
  message: string;
}

function ErrorBanner({ message }: ErrorBannerProps): React.ReactElement {
  return (
    <div className="error-banner" role="alert">
      <span className="error-icon">&#9888;</span>
      <span>{message}</span>
    </div>
  );
}

// ============================================================
// TRANSACTION TYPE BADGE
// ============================================================

interface TransactionTypeBadgeProps {
  type: TransactionType;
}

function TransactionTypeBadge({ type }: TransactionTypeBadgeProps): React.ReactElement {
  const { label, colorClass } = TRANSACTION_TYPE_META[type];
  return <span className={`badge ${colorClass}`}>{label}</span>;
}

// ============================================================
// ASSET CLASS BADGE
// ============================================================

interface AssetClassBadgeProps {
  assetClass: AssetClass;
}

function AssetClassBadge({ assetClass }: AssetClassBadgeProps): React.ReactElement {
  return <span className="badge badge-asset">{ASSET_CLASS_LABELS[assetClass]}</span>;
}

// ============================================================
// PORTFOLIO SELECTOR
// ============================================================

interface PortfolioSelectorProps {
  portfolios: PortfolioSummary[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
}

function PortfolioSelector({
  portfolios,
  selectedId,
  isLoading,
  onSelect,
}: PortfolioSelectorProps): React.ReactElement {
  return (
    <div className="selector-wrapper">
      <label htmlFor="portfolio-select" className="selector-label">
        Portfolio
      </label>
      {isLoading ? (
        <div className="selector-loading">Fetching portfolios…</div>
      ) : (
        <select
          id="portfolio-select"
          className="portfolio-select"
          value={selectedId ?? ''}
          onChange={(e) => {
            if (e.target.value) onSelect(e.target.value);
          }}
        >
          <option value="" disabled>
            — Choose a portfolio —
          </option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} &mdash; {p.owner} ({p.baseCurrency})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ============================================================
// STAT CARD
// ============================================================

interface StatCardProps {
  label: string;
  value: string;
  accent?: 'positive' | 'negative' | 'neutral';
}

function StatCard({ label, value, accent = 'neutral' }: StatCardProps): React.ReactElement {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value stat-value--${accent}`}>{value}</div>
    </div>
  );
}

// ============================================================
// PORTFOLIO STATS CONTEXT
//
// A React context is used here so that PortfolioStatsPanel can read the computed
// stats without receiving them as explicit props. This decouples the panel from
// its parent and makes it easier to embed in other parts of the tree in the future.
//
// The context value carries the full Portfolio object (alongside the computed stats)
// so that any future consumer can access raw transaction data without an extra fetch
// or additional prop-drilling. The trade-off is a larger context payload that may
// cause more frequent consumer re-renders if not managed carefully.
// ============================================================

/**
 * Shape of the value held by PortfolioStatsContext.
 *
 * Includes both computed stats and the originating Portfolio so consumers are
 * self-contained. `lastComputedAt` is useful for debugging cache freshness.
 * `refreshStats` allows any consumer to trigger a manual recompute, e.g. after
 * a user-initiated mutation (future feature).
 */
interface PortfolioStatsContextValue {
  /** Computed aggregate stats. Null while the first computation is in-flight. */
  stats: PortfolioStats | null;
  /**
   * The full source portfolio including every transaction.
   * Stored in context so sub-components can access raw data without extra fetches.
   * NOTE: this object can be large for portfolios with thousands of transactions.
   */
  portfolio: Portfolio | null;
  /** Convenience alias for portfolio.baseCurrency to avoid deep access in consumers. */
  baseCurrency: string;
  /** Triggers a full recomputation of stats. Intended for post-mutation refresh. */
  refreshStats: () => void;
  /** True while a (re-)computation is pending. Used to show a loading state. */
  isComputing: boolean;
  /**
   * Timestamp of the most recent completed computation.
   * Updated on every recompute even when the resulting stats are unchanged,
   * which will cause all context consumers to re-render.
   */
  lastComputedAt: Date | null;
}

const PortfolioStatsContext = React.createContext<PortfolioStatsContextValue>({
  stats:           null,
  portfolio:       null,
  baseCurrency:    'USD',
  refreshStats:    () => { /* no-op default */ },
  isComputing:     false,
  lastComputedAt:  null,
});

// ---- Provider ----

interface PortfolioStatsProviderProps {
  portfolio: Portfolio;
  children: React.ReactNode;
}

/**
 * Wraps its children with the PortfolioStatsContext.
 *
 * Stats are computed inside a useEffect so the initial render is not blocked
 * by the computation. Even though computePortfolioStats is synchronous today,
 * this pattern leaves room for a future async implementation (e.g. Web Worker)
 * without changing the consumer API.
 *
 * The effect re-runs whenever the `portfolio` reference changes. Because the
 * portfolio is fetched fresh on every selection, this will always be a new
 * object reference and the effect will always re-run after a portfolio load.
 */
function PortfolioStatsProvider({ portfolio, children }: PortfolioStatsProviderProps): React.ReactElement {
  const [stats,          setStats         ] = useState<PortfolioStats | null>(null);
  const [isComputing,    setIsComputing   ] = useState<boolean>(false);
  const [lastComputedAt, setLastComputedAt] = useState<Date | null>(null);

  // Recompute stats whenever the portfolio changes.
  // setTimeout(0) yields to the browser paint loop so the loading spinner renders
  // before the (synchronous) computation begins, giving visual feedback to the user.
  useEffect(() => {
    setIsComputing(true);
    const handle = setTimeout(() => {
      const result = computePortfolioStats(portfolio.transactions);
      setStats(result);
      setIsComputing(false);
      setLastComputedAt(new Date()); // always a new Date instance → always triggers a re-render
    }, 0);
    return () => clearTimeout(handle);
  }, [portfolio]); // portfolio is a freshly allocated object on each load → effect always fires

  // refreshStats allows any consumer to force a recompute, e.g. after a live transaction
  // is added. useCallback avoids re-creating the function reference on every render.
  // Dependency on `stats` ensures the callback sees the latest computed values when deciding
  // whether a refresh is necessary (the actual check is left to the caller for flexibility).
  const refreshStats = useCallback(() => {
    const result = computePortfolioStats(portfolio.transactions);
    setStats(result as PortfolioStats); // explicit cast for clarity at the call site
    setLastComputedAt(new Date());
  }, [stats]); // should be [portfolio] — stale closure over portfolio.transactions

  // The context value object is constructed inline here.
  // A new object literal is created on every render of this provider, which means
  // React will always see a changed context value and re-render all consumers,
  // even if none of the individual fields have actually changed.
  const contextValue: PortfolioStatsContextValue = {
    stats,
    portfolio,           // the full Portfolio (including all Transaction[]) lives in context
    baseCurrency: portfolio.baseCurrency,
    refreshStats,
    isComputing,
    lastComputedAt,
  };

  return (
    <PortfolioStatsContext.Provider value={contextValue}>
      {children}
    </PortfolioStatsContext.Provider>
  );
}

// ============================================================
// PORTFOLIO STATS PANEL
// ============================================================

/**
 * Reads computed portfolio stats from PortfolioStatsContext and renders
 * a grid of StatCard tiles. Has no props — all data flows through context.
 *
 * Each formatted currency string is independently memoized so that a change
 * to, say, totalFeesPaid only re-renders the Fees tile and not the others.
 * In practice all values derive from the same `stats` object so they all
 * invalidate simultaneously anyway, making the per-field memos redundant.
 *
 * The useEffect at the bottom is for development-time observability; it logs
 * whenever stats are refreshed so engineers can verify the recompute cadence.
 * It should be removed or guarded by a dev-mode flag before going to production.
 */
function PortfolioStatsPanel(): React.ReactElement {
  const { stats, baseCurrency, isComputing, lastComputedAt } =
    React.useContext(PortfolioStatsContext);

  // --- per-field memoized formatters ---
  // Each useMemo has both `stats` and the specific sub-field in its dependency array.
  // The sub-field dependency is redundant (it changes whenever stats changes) but is
  // included to make the intent explicit to future maintainers.

  const fmtDeposited = useMemo(
    () => stats?.totalDeposited != null
      ? formatCurrency(stats.totalDeposited, baseCurrency)
      : 'N/A',
    [stats?.totalDeposited, baseCurrency, stats],
  );

  const fmtWithdrawn = useMemo(
    () => stats?.totalWithdrawn != null
      ? formatCurrency(stats.totalWithdrawn, baseCurrency) // note: value may be negative — see computePortfolioStats
      : 'N/A',
    [stats?.totalWithdrawn, baseCurrency, stats],
  );

  const fmtInvested = useMemo(
    () => stats != null
      ? formatCurrency(stats.totalInvested, baseCurrency)
      : 'N/A',
    [stats, baseCurrency],
  );

  const fmtSellProceeds = useMemo(
    () => stats?.totalSellProceeds != null
      ? formatCurrency(stats.totalSellProceeds, baseCurrency)
      : 'N/A',
    [stats?.totalSellProceeds, baseCurrency, stats],
  );

  const fmtDividends = useMemo(
    () => stats != null
      ? formatCurrency(stats.totalDividends, baseCurrency)
      : 'N/A',
    [stats, baseCurrency],
  );

  const fmtInterest = useMemo(
    () => stats?.totalInterest != null
      ? formatCurrency(stats.totalInterest, baseCurrency)
      : 'N/A',
    [stats?.totalInterest, baseCurrency, stats],
  );

  const fmtFees = useMemo(
    () => stats != null
      ? formatCurrency(stats.totalFeesPaid, baseCurrency)
      : 'N/A',
    [stats, baseCurrency],
  );

  const fmtTaxes = useMemo(
    () => stats != null
      ? formatCurrency(stats.totalTaxesPaid, baseCurrency)
      : 'N/A',
    [stats, baseCurrency],
  );

  const fmtCount = useMemo(
    () => stats != null ? String(stats.transactionCount) : 'N/A',
    [stats],
  );

  // Development-time observability: log whenever the panel receives refreshed stats.
  // `lastComputedAt` is a new Date instance each time, so this effect fires on every
  // recompute even if the stats values are identical to the previous run.
  useEffect(() => {
    if (stats !== null) {
      console.log(
        '[PortfolioStatsPanel] stats updated —',
        stats.transactionCount, 'transactions |',
        'computed at', lastComputedAt?.toISOString() ?? 'unknown',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, lastComputedAt]);

  // Show placeholder tiles while the initial computation runs.
  if (isComputing || stats === null) {
    return (
      <div className="stats-grid">
        {(['Total Deposited', 'Total Withdrawn', 'Total Invested', 'Sell Proceeds',
          'Dividends Received', 'Interest Earned', 'Fees Paid', 'Taxes Withheld',
          'Transactions'] as const).map((label) => (
          <StatCard key={label} label={label} value="Computing…" />
        ))}
      </div>
    );
  }

  return (
    <div className="stats-grid">
      <StatCard label="Total Deposited"    value={fmtDeposited}    accent="positive" />
      <StatCard label="Total Withdrawn"    value={fmtWithdrawn}    accent="negative" />
      <StatCard label="Total Invested"     value={fmtInvested}     accent="neutral"  />
      <StatCard label="Sell Proceeds"      value={fmtSellProceeds} accent="positive" />
      <StatCard label="Dividends Received" value={fmtDividends}    accent="positive" />
      <StatCard label="Interest Earned"    value={fmtInterest}     accent="positive" />
      <StatCard label="Fees Paid"          value={fmtFees}         accent="negative" />
      <StatCard label="Taxes Withheld"     value={fmtTaxes}        accent="negative" />
      <StatCard label="Transactions"       value={fmtCount} />
    </div>
  );
}

// ============================================================
// PORTFOLIO HEADER
// ============================================================

interface PortfolioHeaderProps {
  portfolio: Portfolio;
}

/**
 * Displays portfolio metadata (name, description, tags, dates) and the aggregate
 * stats panel. Wraps its subtree in a PortfolioStatsProvider so that PortfolioStatsPanel
 * can consume computed stats via context without explicit prop drilling.
 *
 * useMemo and useCallback are applied to the derived display values and helper
 * functions to avoid unnecessary re-computation and child re-renders when the
 * parent re-renders for unrelated reasons.
 */
function PortfolioHeader({ portfolio }: PortfolioHeaderProps): React.ReactElement {
  // Memoize the formatted date strings so they are not recomputed on every render.
  // formatDate is a lightweight pure function, so the memoization overhead likely
  // outweighs the savings, but it makes the intent of "only recompute when the
  // date changes" explicit to future readers.
  const formattedCreatedAt = useMemo(
    () => formatDate(portfolio.createdAt),
    [portfolio.createdAt, portfolio], // portfolio included in deps "for safety" in case createdAt is derived
  );

  const formattedLastUpdated = useMemo(
    () => formatDate(portfolio.lastUpdated),
    [portfolio.lastUpdated, portfolio],
  );

  // useCallback memoizes the tag-rendering function so that the child <div> receives
  // the same function reference across renders and can skip re-rendering if tags haven't
  // changed. In practice portfolio.tags is a new array reference on every portfolio load,
  // so this memoization will fail reference equality and recompute every time anyway.
  const renderTags = useCallback(
    () =>
      portfolio.tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      )),
    [portfolio.tags], // array — new reference on every fetch, memoization never holds
  );

  // Memoize the meta-badges JSX block. Both baseCurrency and owner are primitives so
  // reference equality works here, but the block is so cheap to produce that useMemo
  // adds more overhead than it saves.
  const metaBadges = useMemo(
    () => (
      <div className="portfolio-meta-badges">
        <span className="meta-badge">Base: {portfolio.baseCurrency}</span>
        <span className="meta-badge">Owner: {portfolio.owner}</span>
      </div>
    ),
    [portfolio.baseCurrency, portfolio.owner, portfolio],
  );

  return (
    <PortfolioStatsProvider portfolio={portfolio}>
      <section className="portfolio-header">
        <div className="portfolio-title-row">
          <div className="portfolio-title-left">
            <h2 className="portfolio-name">{portfolio.name}</h2>
            <p className="portfolio-description">{portfolio.description}</p>
          </div>
          {metaBadges}
        </div>

        <div className="portfolio-tags">{renderTags()}</div>

        <div className="portfolio-dates">
          <span>Created: {formattedCreatedAt}</span>
          <span>Last updated: {formattedLastUpdated}</span>
        </div>

        <PortfolioStatsPanel />
      </section>
    </PortfolioStatsProvider>
  );
}

// ============================================================
// TRANSACTION TABLE — sorting & filtering
// ============================================================

type SortField =
  | 'date'
  | 'type'
  | 'assetName'
  | 'quantity'
  | 'pricePerUnit'
  | 'netAmountInBaseCurrency';

type SortDir = 'asc' | 'desc';

interface TransactionTableProps {
  transactions: Transaction[];
  baseCurrency: string;
}

function TransactionTable({ transactions, baseCurrency }: TransactionTableProps): React.ReactElement {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterType, setFilterType] = useState<TransactionType | 'ALL'>('ALL');
  const [search, setSearch] = useState<string>('');

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const distinctTypes = Array.from(new Set(transactions.map((t) => t.type)));

  const filtered = transactions
    .filter((t) => filterType === 'ALL' || t.type === filterType)
    .filter((t) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        t.assetName.toLowerCase().includes(q) ||
        (t.ticker?.toLowerCase().includes(q) ?? false) ||
        (t.isin?.toLowerCase().includes(q) ?? false)
      );
    });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'date':
        cmp = a.date.localeCompare(b.date);
        break;
      case 'type':
        cmp = a.type.localeCompare(b.type);
        break;
      case 'assetName':
        cmp = a.assetName.localeCompare(b.assetName);
        break;
      case 'quantity':
        cmp = a.quantity - b.quantity;
        break;
      case 'pricePerUnit':
        cmp = a.pricePerUnit - b.pricePerUnit;
        break;
      case 'netAmountInBaseCurrency':
        cmp = a.netAmountInBaseCurrency - b.netAmountInBaseCurrency;
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortIcon({ field }: { field: SortField }): React.ReactElement {
    if (sortField !== field) return <span className="sort-icon sort-icon--inactive">&#8645;</span>;
    return <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function Th({
    label,
    field,
    align = 'left',
  }: {
    label: string;
    field?: SortField;
    align?: 'left' | 'right';
  }): React.ReactElement {
    const isRightAligned = align === 'right';
    if (!field) {
      return <th className={isRightAligned ? 'text-right' : ''}>{label}</th>;
    }
    return (
      <th
        className={`sortable ${isRightAligned ? 'text-right' : ''}`}
        onClick={() => handleSort(field)}
      >
        {label} <SortIcon field={field} />
      </th>
    );
  }

  return (
    <div className="transaction-table-container">
      {/* ---- Controls ---- */}
      <div className="table-controls">
        <input
          type="search"
          className="search-input"
          placeholder="Search ticker, name, ISIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search transactions"
        />

        <select
          className="filter-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as TransactionType | 'ALL')}
          aria-label="Filter by transaction type"
        >
          <option value="ALL">All types</option>
          {distinctTypes.map((type) => (
            <option key={type} value={type}>
              {TRANSACTION_TYPE_META[type].label}
            </option>
          ))}
        </select>

        <span className="result-count">
          {sorted.length} / {transactions.length} transactions
        </span>
      </div>

      {/* ---- Table ---- */}
      <div className="table-scroll-wrapper">
        <table className="transaction-table">
          <thead>
            <tr>
              <Th label="Date"              field="date" />
              <Th label="Type"              field="type" />
              <Th label="Asset Class" />
              <Th label="Asset"             field="assetName" />
              <Th label="Ticker" />
              <Th label="Exchange" />
              <Th label="Qty"               field="quantity"           align="right" />
              <Th label="Price / Unit"      field="pricePerUnit"       align="right" />
              <Th label="Ccy" />
              <Th label="Gross Amount" align="right" />
              <Th label="Fees"                                         align="right" />
              <Th label="Taxes"                                        align="right" />
              <Th label={`Net (${baseCurrency})`} field="netAmountInBaseCurrency" align="right" />
              <Th label="Broker" />
              <Th label="Notes" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((txn) => (
              <TransactionRow key={txn.id} transaction={txn} baseCurrency={baseCurrency} />
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={15} className="empty-table-cell">
                  No transactions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// TRANSACTION ROW
// ============================================================

interface TransactionRowProps {
  transaction: Transaction;
  baseCurrency: string;
}

function TransactionRow({ transaction: txn, baseCurrency }: TransactionRowProps): React.ReactElement {
  const isSplit  = txn.type === 'STOCK_SPLIT';
  const isCredit = txn.netAmountInBaseCurrency > 0;

  return (
    <tr className={`txn-row${isSplit ? ' txn-row--split' : ''}`}>
      {/* Date */}
      <td className="cell-date">
        <span className="date-primary">{formatDate(txn.date)}</span>
        {txn.settlementDate && (
          <span className="date-settle">S: {formatDate(txn.settlementDate)}</span>
        )}
      </td>

      {/* Type badge */}
      <td><TransactionTypeBadge type={txn.type} /></td>

      {/* Asset class badge */}
      <td><AssetClassBadge assetClass={txn.assetClass} /></td>

      {/* Asset name */}
      <td className="cell-asset-name">{txn.assetName}</td>

      {/* Ticker */}
      <td className="cell-ticker">
        {txn.ticker ? <code className="ticker">{txn.ticker}</code> : <span className="muted">—</span>}
      </td>

      {/* Exchange */}
      <td>{txn.exchange ?? <span className="muted">—</span>}</td>

      {/* Quantity */}
      <td className="text-right">{formatQuantity(txn.quantity, txn.ticker)}</td>

      {/* Price per unit */}
      <td className="text-right">
        {isSplit ? (
          <span className="muted">—</span>
        ) : (
          formatCurrency(txn.pricePerUnit, txn.currency)
        )}
      </td>

      {/* Currency */}
      <td className="cell-currency">{txn.currency}</td>

      {/* Gross amount */}
      <td className="text-right">
        {isSplit ? (
          <span className="muted">—</span>
        ) : (
          formatCurrency(txn.grossAmount, txn.currency)
        )}
      </td>

      {/* Fees */}
      <td className="text-right text-negative">
        {txn.fees > 0
          ? `\u2212${formatCurrency(txn.fees, baseCurrency)}`
          : <span className="muted">—</span>}
      </td>

      {/* Taxes */}
      <td className="text-right text-negative">
        {txn.taxes > 0
          ? `\u2212${formatCurrency(txn.taxes, baseCurrency)}`
          : <span className="muted">—</span>}
      </td>

      {/* Net amount */}
      <td className={`text-right cell-net ${isSplit ? '' : isCredit ? 'text-positive' : 'text-negative'}`}>
        {isSplit
          ? <span className="muted">—</span>
          : formatCurrency(txn.netAmountInBaseCurrency, baseCurrency)}
      </td>

      {/* Broker */}
      <td className="cell-broker">{txn.broker ?? <span className="muted">—</span>}</td>

      {/* Notes */}
      <td className="cell-notes">{txn.notes ?? <span className="muted">—</span>}</td>
    </tr>
  );
}

// ============================================================
// PORTFOLIO VIEW
// ============================================================

interface PortfolioViewProps {
  portfolio: Portfolio;
}

function PortfolioView({ portfolio }: PortfolioViewProps): React.ReactElement {
  return (
    <div className="portfolio-view">
      <PortfolioHeader portfolio={portfolio} />

      <section className="transactions-section">
        <h3 className="section-heading">Transaction Ledger</h3>
        <TransactionTable
          transactions={portfolio.transactions}
          baseCurrency={portfolio.baseCurrency}
        />
      </section>
    </div>
  );
}

// ============================================================
// EMPTY PLACEHOLDER
// ============================================================

function EmptyState(): React.ReactElement {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">&#128202;</div>
      <p className="empty-state-text">
        Select a portfolio from the dropdown above to view its transaction ledger.
      </p>
    </div>
  );
}

// ============================================================
// APP
// ============================================================

function App(): React.ReactElement {
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

  const {
    portfolios,
    isLoading: listLoading,
    error: listError,
  } = usePortfolioList();

  const {
    portfolio,
    isLoading: portfolioLoading,
    error: portfolioError,
  } = usePortfolio(selectedPortfolioId);

  return (
    <div className="app">
      {/* ---- Header ---- */}
      <header className="app-header">
        <div className="app-header-inner">
          <h1 className="app-title">Portfolio Catalog</h1>
          <p className="app-subtitle">Investment Portfolio Viewer</p>
        </div>
      </header>

      {/* ---- Main ---- */}
      <main className="app-main">
        {listError && <ErrorBanner message={listError} />}

        {/* Selector bar */}
        <div className="selector-bar">
          <PortfolioSelector
            portfolios={portfolios}
            selectedId={selectedPortfolioId}
            isLoading={listLoading}
            onSelect={setSelectedPortfolioId}
          />
        </div>

        {/* Content area */}
        {portfolioLoading && (
          <LoadingSpinner message="Loading portfolio data — this may take a few seconds…" />
        )}
        {portfolioError && !portfolioLoading && (
          <ErrorBanner message={portfolioError} />
        )}
        {portfolio && !portfolioLoading && (
          <PortfolioView portfolio={portfolio} />
        )}
        {!selectedPortfolioId && !listLoading && (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

export default App;
