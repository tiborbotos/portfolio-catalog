import React, { useState } from 'react';
import {
  Transaction,
  TransactionType,
  AssetClass,
  Portfolio,
  PortfolioSummary,
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
// PORTFOLIO STATS PANEL
// ============================================================

function PortfolioStatsPanel(): React.ReactElement {
  return (
    <div className="stats-grid">
      <StatCard label="Total Deposited"    value="N/A" />
      <StatCard label="Total Withdrawn"    value="N/A" />
      <StatCard label="Total Invested"     value="N/A" />
      <StatCard label="Sell Proceeds"      value="N/A" />
      <StatCard label="Dividends Received" value="N/A" />
      <StatCard label="Interest Earned"    value="N/A" />
      <StatCard label="Fees Paid"          value="N/A" />
      <StatCard label="Taxes Withheld"     value="N/A" />
      <StatCard label="Transactions"       value="N/A" />
    </div>
  );
}

// ============================================================
// PORTFOLIO HEADER
// ============================================================

interface PortfolioHeaderProps {
  portfolio: Portfolio;
}

function PortfolioHeader({ portfolio }: PortfolioHeaderProps): React.ReactElement {
  return (
    <section className="portfolio-header">
      <div className="portfolio-title-row">
        <div className="portfolio-title-left">
          <h2 className="portfolio-name">{portfolio.name}</h2>
          <p className="portfolio-description">{portfolio.description}</p>
        </div>
        <div className="portfolio-meta-badges">
          <span className="meta-badge">Base: {portfolio.baseCurrency}</span>
          <span className="meta-badge">Owner: {portfolio.owner}</span>
        </div>
      </div>

      <div className="portfolio-tags">
        {portfolio.tags.map((tag) => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </div>

      <div className="portfolio-dates">
        <span>Created: {formatDate(portfolio.createdAt)}</span>
        <span>Last updated: {formatDate(portfolio.lastUpdated)}</span>
      </div>

      <PortfolioStatsPanel />
    </section>
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
