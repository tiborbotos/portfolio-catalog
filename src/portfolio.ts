import { useState, useEffect } from 'react';

// ============================================================
// TYPES & INTERFACES
// ============================================================

/**
 * All possible transaction types that can occur within a portfolio.
 * Direction (inflow vs outflow) is encoded here rather than via signed quantities.
 */
export type TransactionType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'INTEREST'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'FEE'
  | 'STOCK_SPLIT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

/** Broad classification of the asset involved in a transaction. */
export type AssetClass =
  | 'EQUITY'
  | 'BOND'
  | 'ETF'
  | 'MUTUAL_FUND'
  | 'CRYPTO'
  | 'REAL_ESTATE'
  | 'COMMODITY'
  | 'CASH';

/** ISO 4217 currency codes supported by the platform. */
export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CHF';

/** Stock exchange or trading venue. */
export type Exchange = 'NYSE' | 'NASDAQ' | 'LSE' | 'XETRA' | 'TSE' | 'OTC' | 'CRYPTO';

/**
 * The atomic unit of a portfolio — a single recorded transaction.
 * Positions are never pre-aggregated; the UI derives them from this list.
 */
export interface Transaction {
  /** Unique identifier for this transaction record. */
  id: string;
  /** The portfolio this transaction belongs to. */
  portfolioId: string;
  /** Trade date in YYYY-MM-DD format. */
  date: string;
  /** Settlement date (T+2 for equities), if applicable. */
  settlementDate?: string;
  /** What kind of transaction this is. */
  type: TransactionType;
  /** Broad category of the asset. */
  assetClass: AssetClass;
  /** Ticker symbol (e.g. AAPL, BTC). Absent for plain cash transactions. */
  ticker?: string;
  /** ISIN code, where applicable. */
  isin?: string;
  /** Full human-readable name of the asset. */
  assetName: string;
  /** Exchange or venue where the trade was executed. */
  exchange?: Exchange;
  /**
   * Number of units involved. Always a positive number —
   * direction is determined by `type` (BUY vs SELL, DEPOSIT vs WITHDRAWAL, etc.).
   * For STOCK_SPLIT this represents the *additional* shares received.
   */
  quantity: number;
  /** Price per unit in `currency`. Zero for corporate actions like splits. */
  pricePerUnit: number;
  /** The currency in which the transaction was denominated. */
  currency: Currency;
  /**
   * FX rate from `currency` to the portfolio's base currency at time of transaction.
   * 1.0 when both are the same currency.
   */
  fxRateToBase: number;
  /** Gross trade value: quantity × pricePerUnit, expressed in `currency`. */
  grossAmount: number;
  /** Brokerage / platform fees expressed in the portfolio's base currency. */
  fees: number;
  /**
   * Withholding taxes, stamp duty, and similar levies
   * expressed in the portfolio's base currency.
   */
  taxes: number;
  /**
   * Net cash impact on the portfolio in base currency.
   * Negative values represent cash leaving the portfolio (buys, fees, withdrawals).
   * Positive values represent cash entering the portfolio (sells, dividends, deposits).
   */
  netAmountInBaseCurrency: number;
  /** Optional free-text note about this transaction. */
  notes?: string;
  /** Broker or custodian that executed / holds this transaction. */
  broker?: string;
}

/** Lightweight portfolio descriptor used in the dropdown selector. */
export interface PortfolioSummary {
  id: string;
  name: string;
  description: string;
  baseCurrency: Currency;
  owner: string;
  /** ISO 8601 date the portfolio was created. */
  createdAt: string;
  /** ISO 8601 date of the most recent update. */
  lastUpdated: string;
  tags: string[];
}

/** Full portfolio with the complete transaction ledger. */
export interface Portfolio extends PortfolioSummary {
  transactions: Transaction[];
}

/**
 * Aggregate statistics computed from a portfolio's raw transaction list.
 *
 * This interface is intentionally shared between the frontend state layer and
 * the future API response shape so we don't have to maintain two separate types.
 * Fields that the older API version does not return yet are marked optional —
 * consumers should always guard against undefined before reading them.
 *
 * NOTE: rawTransactions and portfolioId are included for convenience/debuggability
 * so that downstream consumers don't need an additional fetch or prop-drilling chain
 * to access the underlying data. This will be revisited if the payload gets too large.
 */
export interface PortfolioStats {
  totalDeposited: number;
  /** Optional — portfolios with no outflows will omit this field entirely. */
  totalWithdrawn?: number;
  totalInvested: number;
  /** Optional — portfolios that have never closed a position will not have this. */
  totalSellProceeds?: number;
  totalDividends: number;
  /** Optional — only meaningful for income-oriented or bond-heavy portfolios. */
  totalInterest?: number;
  totalFeesPaid: number;
  totalTaxesPaid: number;
  transactionCount: number;
  netCashFlow: number;
  /**
   * Raw transactions attached for consumer convenience.
   * Avoids an extra round-trip when the full ledger is needed alongside the stats.
   * In future API versions this will be populated server-side.
   */
  rawTransactions?: Transaction[];
  /** Portfolio identifier forwarded for logging and analytics traceability. */
  portfolioId?: string;
}

// Hook return types

export interface UsePortfolioListResult {
  portfolios: PortfolioSummary[];
  isLoading: boolean;
  error: string | null;
}

export interface UsePortfolioResult {
  portfolio: Portfolio | null;
  isLoading: boolean;
  error: string | null;
}

// ============================================================
// MOCK DATA
// ============================================================

// ---- Simple Portfolio ----

const SIMPLE_PORTFOLIO_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn-s-001',
    portfolioId: 'portfolio-001',
    date: '2024-01-15',
    type: 'DEPOSIT',
    assetClass: 'CASH',
    assetName: 'Cash Deposit',
    quantity: 10000,
    pricePerUnit: 1,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 10000,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: 10000,
    notes: 'Initial portfolio funding',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-s-002',
    portfolioId: 'portfolio-001',
    date: '2024-01-16',
    settlementDate: '2024-01-18',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'AAPL',
    isin: 'US0378331005',
    assetName: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: 10,
    pricePerUnit: 182.31,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 1823.10,
    fees: 1.00,
    taxes: 0,
    netAmountInBaseCurrency: -1824.10,
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-s-003',
    portfolioId: 'portfolio-001',
    date: '2024-01-22',
    settlementDate: '2024-01-24',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'MSFT',
    isin: 'US5949181045',
    assetName: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    quantity: 5,
    pricePerUnit: 395.22,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 1976.10,
    fees: 1.00,
    taxes: 0,
    netAmountInBaseCurrency: -1977.10,
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-s-004',
    portfolioId: 'portfolio-001',
    date: '2024-02-05',
    settlementDate: '2024-02-07',
    type: 'BUY',
    assetClass: 'ETF',
    ticker: 'VTI',
    isin: 'US9229087690',
    assetName: 'Vanguard Total Stock Market ETF',
    exchange: 'NYSE',
    quantity: 15,
    pricePerUnit: 234.50,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 3517.50,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: -3517.50,
    notes: 'Commission-free ETF purchase',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-s-005',
    portfolioId: 'portfolio-001',
    date: '2024-02-15',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'AAPL',
    isin: 'US0378331005',
    assetName: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: 10,
    pricePerUnit: 0.24,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 2.40,
    fees: 0,
    taxes: 0.36,
    netAmountInBaseCurrency: 2.04,
    notes: 'Q1 2024 dividend — 15% US withholding tax applied',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-s-006',
    portfolioId: 'portfolio-001',
    date: '2024-03-10',
    settlementDate: '2024-03-12',
    type: 'SELL',
    assetClass: 'EQUITY',
    ticker: 'AAPL',
    isin: 'US0378331005',
    assetName: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: 3,
    pricePerUnit: 175.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 525.00,
    fees: 1.00,
    taxes: 0,
    netAmountInBaseCurrency: 524.00,
    notes: 'Partial sell to rebalance towards ETF',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-s-007',
    portfolioId: 'portfolio-001',
    date: '2024-04-01',
    type: 'FEE',
    assetClass: 'CASH',
    assetName: 'Platform Fee',
    quantity: 1,
    pricePerUnit: 10.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 10.00,
    fees: 10.00,
    taxes: 0,
    netAmountInBaseCurrency: -10.00,
    notes: 'Monthly platform maintenance fee',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-s-008',
    portfolioId: 'portfolio-001',
    date: '2024-04-15',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'MSFT',
    isin: 'US5949181045',
    assetName: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    quantity: 5,
    pricePerUnit: 0.75,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 3.75,
    fees: 0,
    taxes: 0.56,
    netAmountInBaseCurrency: 3.19,
    notes: 'Q2 2024 dividend — 15% withholding tax applied',
    broker: 'Interactive Brokers',
  },
];

// ---- Complex Portfolio ----

const COMPLEX_PORTFOLIO_TRANSACTIONS: Transaction[] = [
  // === DEPOSITS ===
  {
    id: 'txn-c-001',
    portfolioId: 'portfolio-002',
    date: '2022-01-03',
    type: 'DEPOSIT',
    assetClass: 'CASH',
    assetName: 'Cash Deposit',
    quantity: 50000,
    pricePerUnit: 1,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 50000,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: 50000,
    notes: 'Initial portfolio funding — wire transfer',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-002',
    portfolioId: 'portfolio-002',
    date: '2022-07-01',
    type: 'DEPOSIT',
    assetClass: 'CASH',
    assetName: 'Cash Deposit',
    quantity: 25000,
    pricePerUnit: 1,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 25000,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: 25000,
    notes: 'Mid-year top-up — buying the dip',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-003',
    portfolioId: 'portfolio-002',
    date: '2023-01-02',
    type: 'DEPOSIT',
    assetClass: 'CASH',
    assetName: 'Cash Deposit',
    quantity: 30000,
    pricePerUnit: 1,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 30000,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: 30000,
    notes: 'Annual new-year deposit',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-004',
    portfolioId: 'portfolio-002',
    date: '2024-01-03',
    type: 'DEPOSIT',
    assetClass: 'CASH',
    assetName: 'Cash Deposit',
    quantity: 20000,
    pricePerUnit: 1,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 20000,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: 20000,
    notes: '2024 new-year deposit',
    broker: 'Interactive Brokers',
  },

  // === CORE EQUITY & ETF PURCHASES — 2022 Q1 ===
  {
    id: 'txn-c-010',
    portfolioId: 'portfolio-002',
    date: '2022-01-05',
    settlementDate: '2022-01-07',
    type: 'BUY',
    assetClass: 'ETF',
    ticker: 'SPY',
    isin: 'US78462F1030',
    assetName: 'SPDR S&P 500 ETF Trust',
    exchange: 'NYSE',
    quantity: 30,
    pricePerUnit: 474.91,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 14247.30,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: -14247.30,
    notes: 'Core S&P 500 exposure — commission-free',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-011',
    portfolioId: 'portfolio-002',
    date: '2022-01-10',
    settlementDate: '2022-01-12',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'AAPL',
    isin: 'US0378331005',
    assetName: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: 50,
    pricePerUnit: 172.17,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 8608.50,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: -8611.00,
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-012',
    portfolioId: 'portfolio-002',
    date: '2022-01-18',
    settlementDate: '2022-01-20',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'MSFT',
    isin: 'US5949181045',
    assetName: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    quantity: 20,
    pricePerUnit: 296.03,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 5920.60,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: -5923.10,
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-013',
    portfolioId: 'portfolio-002',
    date: '2022-02-01',
    settlementDate: '2022-02-03',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'GOOGL',
    isin: 'US02079K3059',
    assetName: 'Alphabet Inc. Class A',
    exchange: 'NASDAQ',
    quantity: 4,
    pricePerUnit: 2894.53,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 11578.12,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: -11580.62,
    notes: 'Pre-split price (20:1 split occurred June 2022)',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-014',
    portfolioId: 'portfolio-002',
    date: '2022-03-15',
    settlementDate: '2022-03-17',
    type: 'BUY',
    assetClass: 'BOND',
    ticker: 'TLT',
    isin: 'US4642874329',
    assetName: 'iShares 20+ Year Treasury Bond ETF',
    exchange: 'NASDAQ',
    quantity: 40,
    pricePerUnit: 130.10,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 5204.00,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: -5204.00,
    notes: 'Bond allocation for portfolio ballast',
    broker: 'Interactive Brokers',
  },

  // === CORPORATE ACTION: GOOGL 20:1 STOCK SPLIT (Jul 2022) ===
  {
    id: 'txn-c-020',
    portfolioId: 'portfolio-002',
    date: '2022-07-18',
    type: 'STOCK_SPLIT',
    assetClass: 'EQUITY',
    ticker: 'GOOGL',
    isin: 'US02079K3059',
    assetName: 'Alphabet Inc. Class A',
    exchange: 'NASDAQ',
    quantity: 76,
    pricePerUnit: 112.02,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 0,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: 0,
    notes: '20:1 stock split (effective 2022-07-18). 4 pre-split shares → 80 post-split shares (+76).',
    broker: 'Interactive Brokers',
  },

  // === CRYPTO PURCHASES — 2022 Q3 (post-crash DCA) ===
  {
    id: 'txn-c-025',
    portfolioId: 'portfolio-002',
    date: '2022-07-05',
    type: 'BUY',
    assetClass: 'CRYPTO',
    ticker: 'BTC',
    assetName: 'Bitcoin',
    exchange: 'CRYPTO',
    quantity: 0.5,
    pricePerUnit: 19842.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 9921.00,
    fees: 49.61,
    taxes: 0,
    netAmountInBaseCurrency: -9970.61,
    notes: 'BTC DCA entry after crypto crash — Coinbase fee 0.5%',
    broker: 'Coinbase',
  },
  {
    id: 'txn-c-026',
    portfolioId: 'portfolio-002',
    date: '2022-07-10',
    type: 'BUY',
    assetClass: 'CRYPTO',
    ticker: 'ETH',
    assetName: 'Ethereum',
    exchange: 'CRYPTO',
    quantity: 5,
    pricePerUnit: 1183.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 5915.00,
    fees: 29.58,
    taxes: 0,
    netAmountInBaseCurrency: -5944.58,
    notes: 'ETH DCA entry post-Merge speculation',
    broker: 'Coinbase',
  },

  // === EUROPEAN EQUITY (EUR-denominated) ===
  {
    id: 'txn-c-030',
    portfolioId: 'portfolio-002',
    date: '2022-08-10',
    settlementDate: '2022-08-12',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'SAP',
    isin: 'DE0007164600',
    assetName: 'SAP SE',
    exchange: 'XETRA',
    quantity: 30,
    pricePerUnit: 92.10,
    currency: 'EUR',
    fxRateToBase: 1.02,
    grossAmount: 2763.00,
    fees: 5.00,
    taxes: 0,
    netAmountInBaseCurrency: -2823.26,
    notes: 'European tech exposure — EUR/USD rate was 1.02 at execution',
    broker: 'Interactive Brokers',
  },

  // === NVIDIA — initial position ===
  {
    id: 'txn-c-035',
    portfolioId: 'portfolio-002',
    date: '2022-10-14',
    settlementDate: '2022-10-18',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'NVDA',
    isin: 'US67066G1040',
    assetName: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    quantity: 40,
    pricePerUnit: 125.61,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 5024.40,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: -5026.90,
    notes: 'Initiated NVDA during tech selloff — AI thesis',
    broker: 'Interactive Brokers',
  },

  // === DIVIDENDS — 2022 ===
  {
    id: 'txn-c-040',
    portfolioId: 'portfolio-002',
    date: '2022-08-12',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'AAPL',
    isin: 'US0378331005',
    assetName: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: 50,
    pricePerUnit: 0.23,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 11.50,
    fees: 0,
    taxes: 1.73,
    netAmountInBaseCurrency: 9.77,
    notes: 'Q3 2022 dividend — 15% withholding tax',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-041',
    portfolioId: 'portfolio-002',
    date: '2022-11-15',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'MSFT',
    isin: 'US5949181045',
    assetName: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    quantity: 20,
    pricePerUnit: 0.68,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 13.60,
    fees: 0,
    taxes: 2.04,
    netAmountInBaseCurrency: 11.56,
    notes: 'Q4 2022 dividend — 15% withholding tax',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-042',
    portfolioId: 'portfolio-002',
    date: '2022-12-01',
    type: 'DIVIDEND',
    assetClass: 'BOND',
    ticker: 'TLT',
    isin: 'US4642874329',
    assetName: 'iShares 20+ Year Treasury Bond ETF',
    exchange: 'NASDAQ',
    quantity: 40,
    pricePerUnit: 0.28,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 11.20,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: 11.20,
    notes: 'Monthly interest income distribution from TLT',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-043',
    portfolioId: 'portfolio-002',
    date: '2022-12-15',
    type: 'DIVIDEND',
    assetClass: 'ETF',
    ticker: 'SPY',
    isin: 'US78462F1030',
    assetName: 'SPDR S&P 500 ETF Trust',
    exchange: 'NYSE',
    quantity: 30,
    pricePerUnit: 1.56,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 46.80,
    fees: 0,
    taxes: 7.02,
    netAmountInBaseCurrency: 39.78,
    notes: 'Q4 2022 SPY quarterly distribution — 15% withholding',
    broker: 'Interactive Brokers',
  },

  // === ANNUAL PLATFORM FEE 2022 ===
  {
    id: 'txn-c-044',
    portfolioId: 'portfolio-002',
    date: '2022-12-31',
    type: 'FEE',
    assetClass: 'CASH',
    assetName: 'Annual Platform Fee',
    quantity: 1,
    pricePerUnit: 120.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 120.00,
    fees: 120.00,
    taxes: 0,
    netAmountInBaseCurrency: -120.00,
    notes: 'Annual custodian/platform management fee 2022',
    broker: 'Interactive Brokers',
  },

  // === 2023 ACTIVITY ===
  {
    id: 'txn-c-050',
    portfolioId: 'portfolio-002',
    date: '2023-01-05',
    settlementDate: '2023-01-09',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'AMZN',
    isin: 'US0231351067',
    assetName: 'Amazon.com Inc.',
    exchange: 'NASDAQ',
    quantity: 40,
    pricePerUnit: 85.82,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 3432.80,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: -3435.30,
    notes: 'Initiating AMZN position at multi-year lows',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-051',
    portfolioId: 'portfolio-002',
    date: '2023-02-10',
    settlementDate: '2023-02-14',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'NVDA',
    isin: 'US67066G1040',
    assetName: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    quantity: 20,
    pricePerUnit: 207.41,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 4148.20,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: -4150.70,
    notes: 'Adding to NVDA — ChatGPT momentum thesis',
    broker: 'Interactive Brokers',
  },

  // === DIVIDENDS 2023 ===
  {
    id: 'txn-c-060',
    portfolioId: 'portfolio-002',
    date: '2023-02-17',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'AAPL',
    isin: 'US0378331005',
    assetName: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: 50,
    pricePerUnit: 0.23,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 11.50,
    fees: 0,
    taxes: 1.73,
    netAmountInBaseCurrency: 9.77,
    notes: 'Q1 2023 dividend',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-061',
    portfolioId: 'portfolio-002',
    date: '2023-03-22',
    settlementDate: '2023-03-24',
    type: 'SELL',
    assetClass: 'BOND',
    ticker: 'TLT',
    isin: 'US4642874329',
    assetName: 'iShares 20+ Year Treasury Bond ETF',
    exchange: 'NASDAQ',
    quantity: 40,
    pricePerUnit: 102.68,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 4107.20,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: 4107.20,
    notes: 'Closed full TLT position — rotating proceeds to equities',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-062',
    portfolioId: 'portfolio-002',
    date: '2023-05-15',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'MSFT',
    isin: 'US5949181045',
    assetName: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    quantity: 20,
    pricePerUnit: 0.68,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 13.60,
    fees: 0,
    taxes: 2.04,
    netAmountInBaseCurrency: 11.56,
    notes: 'Q2 2023 dividend',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-063',
    portfolioId: 'portfolio-002',
    date: '2023-05-16',
    settlementDate: '2023-05-18',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'NVDA',
    isin: 'US67066G1040',
    assetName: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    quantity: 10,
    pricePerUnit: 305.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 3050.00,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: -3052.50,
    notes: 'Adding NVDA after blowout Q1 earnings and guidance raise',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-064',
    portfolioId: 'portfolio-002',
    date: '2023-05-25',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'SAP',
    isin: 'DE0007164600',
    assetName: 'SAP SE',
    exchange: 'XETRA',
    quantity: 30,
    pricePerUnit: 1.50,
    currency: 'EUR',
    fxRateToBase: 1.08,
    grossAmount: 45.00,
    fees: 0,
    taxes: 10.80,
    netAmountInBaseCurrency: 37.80,
    notes: 'SAP annual dividend. EUR/USD 1.08. 24% Kapitalertragsteuer withheld.',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-065',
    portfolioId: 'portfolio-002',
    date: '2023-08-11',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'AAPL',
    isin: 'US0378331005',
    assetName: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: 50,
    pricePerUnit: 0.24,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 12.00,
    fees: 0,
    taxes: 1.80,
    netAmountInBaseCurrency: 10.20,
    notes: 'Q3 2023 dividend',
    broker: 'Interactive Brokers',
  },

  // === Q3 2023 CASH INTEREST ===
  {
    id: 'txn-c-066',
    portfolioId: 'portfolio-002',
    date: '2023-09-30',
    type: 'INTEREST',
    assetClass: 'CASH',
    assetName: 'Cash Interest — IBKR HYSA',
    quantity: 1,
    pricePerUnit: 156.42,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 156.42,
    fees: 0,
    taxes: 23.46,
    netAmountInBaseCurrency: 132.96,
    notes: 'Q3 2023 interest on uninvested cash (IBKR Money Market Rate 4.83%)',
    broker: 'Interactive Brokers',
  },

  // === PARTIAL CRYPTO SELL ===
  {
    id: 'txn-c-070',
    portfolioId: 'portfolio-002',
    date: '2023-10-20',
    type: 'SELL',
    assetClass: 'CRYPTO',
    ticker: 'ETH',
    assetName: 'Ethereum',
    exchange: 'CRYPTO',
    quantity: 2,
    pricePerUnit: 1598.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 3196.00,
    fees: 15.98,
    taxes: 0,
    netAmountInBaseCurrency: 3180.02,
    notes: 'Partial ETH sell — locking in gains, still holding 3 ETH',
    broker: 'Coinbase',
  },

  // === Q4 2023 INTEREST ===
  {
    id: 'txn-c-071',
    portfolioId: 'portfolio-002',
    date: '2023-12-31',
    type: 'INTEREST',
    assetClass: 'CASH',
    assetName: 'Cash Interest — IBKR HYSA',
    quantity: 1,
    pricePerUnit: 203.77,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 203.77,
    fees: 0,
    taxes: 30.57,
    netAmountInBaseCurrency: 173.20,
    notes: 'Q4 2023 interest on uninvested cash',
    broker: 'Interactive Brokers',
  },

  // === ANNUAL PLATFORM FEE 2023 ===
  {
    id: 'txn-c-072',
    portfolioId: 'portfolio-002',
    date: '2023-12-31',
    type: 'FEE',
    assetClass: 'CASH',
    assetName: 'Annual Platform Fee',
    quantity: 1,
    pricePerUnit: 120.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 120.00,
    fees: 120.00,
    taxes: 0,
    netAmountInBaseCurrency: -120.00,
    notes: 'Annual custodian/platform management fee 2023',
    broker: 'Interactive Brokers',
  },

  // === 2024 ACTIVITY ===
  {
    id: 'txn-c-080',
    portfolioId: 'portfolio-002',
    date: '2024-01-08',
    settlementDate: '2024-01-10',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'MSFT',
    isin: 'US5949181045',
    assetName: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    quantity: 5,
    pricePerUnit: 374.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 1870.00,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: -1872.50,
    notes: 'Adding MSFT — Copilot/Azure AI monetisation thesis',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-081',
    portfolioId: 'portfolio-002',
    date: '2024-02-08',
    settlementDate: '2024-02-12',
    type: 'BUY',
    assetClass: 'EQUITY',
    ticker: 'META',
    isin: 'US30303M1027',
    assetName: 'Meta Platforms Inc.',
    exchange: 'NASDAQ',
    quantity: 10,
    pricePerUnit: 474.99,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 4749.90,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: -4752.40,
    notes: 'Initiating META after strong Q4 2023 earnings and dividend announcement',
    broker: 'Interactive Brokers',
  },

  // === DIVIDENDS 2024 ===
  {
    id: 'txn-c-090',
    portfolioId: 'portfolio-002',
    date: '2024-02-16',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'AAPL',
    isin: 'US0378331005',
    assetName: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: 50,
    pricePerUnit: 0.24,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 12.00,
    fees: 0,
    taxes: 1.80,
    netAmountInBaseCurrency: 10.20,
    notes: 'Q1 2024 dividend',
    broker: 'Interactive Brokers',
  },
  {
    id: 'txn-c-091',
    portfolioId: 'portfolio-002',
    date: '2024-03-07',
    type: 'DIVIDEND',
    assetClass: 'ETF',
    ticker: 'SPY',
    isin: 'US78462F1030',
    assetName: 'SPDR S&P 500 ETF Trust',
    exchange: 'NYSE',
    quantity: 30,
    pricePerUnit: 1.63,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 48.90,
    fees: 0,
    taxes: 7.34,
    netAmountInBaseCurrency: 41.56,
    notes: 'SPY Q1 2024 quarterly distribution',
    broker: 'Interactive Brokers',
  },

  // === MORE BTC (near ATH) ===
  {
    id: 'txn-c-082',
    portfolioId: 'portfolio-002',
    date: '2024-03-14',
    type: 'BUY',
    assetClass: 'CRYPTO',
    ticker: 'BTC',
    assetName: 'Bitcoin',
    exchange: 'CRYPTO',
    quantity: 0.1,
    pricePerUnit: 71500.00,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 7150.00,
    fees: 35.75,
    taxes: 0,
    netAmountInBaseCurrency: -7185.75,
    notes: 'Adding BTC near ATH driven by spot ETF approval inflows',
    broker: 'Coinbase',
  },

  // === TRIM AAPL ===
  {
    id: 'txn-c-083',
    portfolioId: 'portfolio-002',
    date: '2024-04-10',
    settlementDate: '2024-04-12',
    type: 'SELL',
    assetClass: 'EQUITY',
    ticker: 'AAPL',
    isin: 'US0378331005',
    assetName: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: 20,
    pricePerUnit: 171.83,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 3436.60,
    fees: 2.50,
    taxes: 0,
    netAmountInBaseCurrency: 3434.10,
    notes: 'Trimming AAPL — underperforming vs. rest of Mag-7',
    broker: 'Interactive Brokers',
  },

  // === MSFT DIVIDEND Q2 2024 ===
  {
    id: 'txn-c-092',
    portfolioId: 'portfolio-002',
    date: '2024-05-20',
    type: 'DIVIDEND',
    assetClass: 'EQUITY',
    ticker: 'MSFT',
    isin: 'US5949181045',
    assetName: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    quantity: 25,
    pricePerUnit: 0.75,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 18.75,
    fees: 0,
    taxes: 2.81,
    netAmountInBaseCurrency: 15.94,
    notes: 'Q2 2024 MSFT dividend (25 shares after Jan top-up)',
    broker: 'Interactive Brokers',
  },

  // === CORPORATE ACTION: NVDA 10:1 STOCK SPLIT (Jun 2024) ===
  {
    id: 'txn-c-075',
    portfolioId: 'portfolio-002',
    date: '2024-06-10',
    type: 'STOCK_SPLIT',
    assetClass: 'EQUITY',
    ticker: 'NVDA',
    isin: 'US67066G1040',
    assetName: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    quantity: 630,
    pricePerUnit: 120.88,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 0,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: 0,
    notes: '10:1 stock split (effective 2024-06-10). 70 pre-split shares → 700 post-split shares (+630).',
    broker: 'Interactive Brokers',
  },

  // === TRANSFER OUT (partial withdrawal) ===
  {
    id: 'txn-c-095',
    portfolioId: 'portfolio-002',
    date: '2024-07-15',
    type: 'WITHDRAWAL',
    assetClass: 'CASH',
    assetName: 'Cash Withdrawal',
    quantity: 5000,
    pricePerUnit: 1,
    currency: 'USD',
    fxRateToBase: 1,
    grossAmount: 5000,
    fees: 0,
    taxes: 0,
    netAmountInBaseCurrency: -5000,
    notes: 'Partial withdrawal for personal expenses',
    broker: 'Interactive Brokers',
  },
];

// ============================================================
// PORTFOLIO CATALOGUE
// ============================================================

export const MOCK_PORTFOLIO_SUMMARIES: PortfolioSummary[] = [
  {
    id: 'portfolio-001',
    name: 'Tech Starter',
    description:
      'A simple, technology-focused beginner portfolio holding major US tech stocks and a broad-market ETF. Suitable for illustrating basic buy/sell/dividend flows.',
    baseCurrency: 'USD',
    owner: 'John Doe',
    createdAt: '2024-01-15',
    lastUpdated: '2024-04-15',
    tags: ['technology', 'beginner', 'US equity'],
  },
  {
    id: 'portfolio-002',
    name: 'Diversified Growth',
    description:
      'A complex multi-asset portfolio with global equities, ETFs, bonds, crypto, and European stocks. Includes corporate actions (stock splits), FX transactions, withholding taxes, and cash management across 2022–2024.',
    baseCurrency: 'USD',
    owner: 'Jane Smith',
    createdAt: '2022-01-03',
    lastUpdated: '2024-07-15',
    tags: ['diversified', 'multi-asset', 'global', 'crypto', 'active'],
  },
];

export const MOCK_PORTFOLIOS: Record<string, Portfolio> = {
  'portfolio-001': {
    ...MOCK_PORTFOLIO_SUMMARIES[0],
    transactions: SIMPLE_PORTFOLIO_TRANSACTIONS,
  },
  'portfolio-002': {
    ...MOCK_PORTFOLIO_SUMMARIES[1],
    transactions: COMPLEX_PORTFOLIO_TRANSACTIONS,
  },
};

// ============================================================
// PORTFOLIO SERVICE  (mocked — simulates slow backend)
// ============================================================

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const randomDelay = (minMs: number, maxMs: number): Promise<void> =>
  delay(minMs + Math.random() * (maxMs - minMs));

export const portfolioService = {
  /**
   * Fetch the list of available portfolio summaries.
   * Simulates a slow network request (1.0 – 2.0 s).
   */
  async fetchPortfolioList(): Promise<PortfolioSummary[]> {
    await randomDelay(1000, 2000);
    return [...MOCK_PORTFOLIO_SUMMARIES];
  },

  /**
   * Fetch a single portfolio with its full transaction ledger.
   * Simulates a slower request (2.5 – 4.5 s) — the payload can be large.
   */
  async fetchPortfolio(id: string): Promise<Portfolio> {
    await randomDelay(2500, 4500);
    const portfolio = MOCK_PORTFOLIOS[id];
    if (!portfolio) {
      throw new Error(`Portfolio "${id}" was not found.`);
    }
    // Return a shallow copy to prevent accidental mutation of mock data.
    return { ...portfolio, transactions: [...portfolio.transactions] };
  },
};

// ============================================================
// UTILITY: compute aggregate statistics from a flat transaction list
// ============================================================

/**
 * Computes portfolio-level aggregate statistics by performing a single forward pass
 * over the provided transaction list. Time complexity is O(n) where n = transactions.length.
 *
 * Design decisions worth noting:
 *
 * - Fees and taxes are accumulated unconditionally at the top of the loop because every
 *   transaction type can carry them. This means a BUY with a $5 brokerage fee contributes
 *   to both `totalInvested` (via its net amount) and `totalFeesPaid` simultaneously.
 *
 * - TRANSFER_IN is intentionally excluded from `totalDeposited`. It represents an internal
 *   fund movement between custodian accounts, not new external capital being deployed.
 *   This distinction may need revisiting if the business definition of "invested capital" changes.
 *
 * - For WITHDRAWAL, `netAmountInBaseCurrency` carries a negative sign (cash leaves the
 *   portfolio). The raw signed value is preserved here rather than using Math.abs so that
 *   the `netCashFlow` formula below can use simple addition and still produce the right
 *   magnitude. See the netCashFlow comment for details.
 *
 * - The parameter is typed as `any[]` rather than `Transaction[]` to remain flexible when
 *   receiving partially-shaped or legacy API payloads that may not fully conform to the
 *   Transaction interface. Callers that have a fully typed array can pass it without casting.
 *
 * TODO: Server-side aggregation would be preferable for portfolios exceeding ~10 000 transactions.
 * TODO: Multi-currency support — currently all amounts are assumed to be pre-converted to base currency.
 * TODO: Consider memoizing at the call site; this function is pure but called on every render.
 *
 * @param transactions - Flat list of portfolio transactions (typed as any[] for API flexibility).
 * @returns A populated PortfolioStats object.
 */
export function computePortfolioStats(transactions: any[]): PortfolioStats {
  // ---- accumulators (all in portfolio base currency) ----
  let totalDeposited    = 0;
  let totalWithdrawn    = 0;
  let totalInvested     = 0;
  let totalSellProceeds = 0;
  let totalDividends    = 0;
  let totalInterest     = 0;
  // Fees and taxes live outside the switch because they apply universally.
  // See design decision note in the JSDoc above.
  let totalFeesPaid     = 0;
  let totalTaxesPaid    = 0;

  // Single forward pass — O(n).
  for (const txn of transactions) {
    // Always accumulate fees and taxes regardless of transaction type.
    totalFeesPaid  += txn.fees;
    totalTaxesPaid += txn.taxes;

    switch (txn.type) {
      case 'DEPOSIT':
        // External capital injected by the investor.
        // TRANSFER_IN intentionally excluded — see JSDoc above.
        totalDeposited += txn.netAmountInBaseCurrency;
        break;

      case 'WITHDRAWAL':
        // netAmountInBaseCurrency is negative for outflows (cash leaves the portfolio).
        // We preserve the raw sign here rather than calling Math.abs so that the
        // netCashFlow arithmetic below works without a subtraction operator.
        // This is a deliberate sign convention, not an oversight.
        totalWithdrawn += txn.netAmountInBaseCurrency;
        break;

      case 'BUY':
        // Absolute cost of acquiring the asset, fees already baked into the net amount.
        totalInvested += Math.abs(txn.netAmountInBaseCurrency);
        break;

      case 'SELL':
        totalSellProceeds += txn.netAmountInBaseCurrency;
        break;

      case 'DIVIDEND':
        totalDividends += txn.netAmountInBaseCurrency;
        break;

      case 'INTEREST':
        totalInterest += txn.netAmountInBaseCurrency;
        break;

      // STOCK_SPLIT, FEE, TRANSFER_IN, TRANSFER_OUT:
      // No direct cash impact to surface here beyond fees/taxes captured above.
      // FEE transactions carry their full amount in txn.fees, already accumulated.
    }
  }

  // Net cash flow = capital deposited minus capital returned to the investor.
  // Because totalWithdrawn holds the raw negative net amounts (see WITHDRAWAL case),
  // we use addition here — the negative sign on totalWithdrawn handles the subtraction
  // implicitly, avoiding a double-negative that would inflate the figure.
  const netCashFlow = totalDeposited + totalWithdrawn;

  return {
    totalDeposited,
    totalWithdrawn,       // will be negative when withdrawals exist — see sign-convention note above
    totalInvested,
    totalSellProceeds,
    totalDividends,
    totalInterest,
    totalFeesPaid,
    totalTaxesPaid,
    transactionCount: transactions.length,
    netCashFlow,
    rawTransactions: transactions as Transaction[],  // cast: any[] → Transaction[] for downstream consumers
  };
}

// ============================================================
// CUSTOM HOOKS
// ============================================================

/** Fetches the list of available portfolio summaries on mount. */
export function usePortfolioList(): UsePortfolioListResult {
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    portfolioService
      .fetchPortfolioList()
      .then((data) => {
        if (!cancelled) {
          setPortfolios(data);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load portfolio list.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { portfolios, isLoading, error };
}

/**
 * Fetches a full portfolio (with all transactions) whenever `portfolioId` changes.
 * Passes `null` to clear the current portfolio without triggering a fetch.
 */
export function usePortfolio(portfolioId: string | null): UsePortfolioResult {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!portfolioId) {
      setPortfolio(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setError(null);
    setPortfolio(null);

    portfolioService
      .fetchPortfolio(portfolioId)
      .then((data) => {
        if (!cancelled) {
          setPortfolio(data);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load portfolio.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  return { portfolio, isLoading, error };
}
