import 'dotenv/config'
import type { RuntimeConfig } from '../core/types.js'

function required(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env: ${name}`)
  return val
}

function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? v : fallback
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (!raw) return fallback
  return raw === 'true' || raw === '1'
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name]
  if (!raw) return fallback
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export function loadConfig(): RuntimeConfig {
  return {
    claudeApiKey: required('CLAUDE_API_KEY'),
    claudeModel: process.env['CLAUDE_MODEL'] ?? 'claude-sonnet-4-20250514',

    exchangeEnabled: boolean('EXCHANGE_ENABLED', false),
    exchangeProvider: (process.env['EXCHANGE_PROVIDER'] as 'binance' | 'okx') ?? 'okx',
    exchangeApiKey: process.env['EXCHANGE_API_KEY'] ?? '',
    exchangeSecretKey: process.env['EXCHANGE_SECRET_KEY'] ?? '',
    exchangePassword: process.env['EXCHANGE_PASSWORD'] ?? '',
    exchangeTestnet: boolean('EXCHANGE_TESTNET', true),

    dryRun: boolean('DRY_RUN', true),
    autoTradeEnabled: boolean('AUTO_TRADE_ENABLED', false),
    maxPositionPct: num('MAX_POSITION_PCT', 20),
    maxConcurrentPositions: num('MAX_CONCURRENT_POSITIONS', 3),
    maxDailyLossPct: num('MAX_DAILY_LOSS_PCT', 2),
    minSignalConfidence: num('MIN_SIGNAL_CONFIDENCE', 60),
    tradeMinNotionalUsdt: num('TRADE_MIN_NOTIONAL_USDT', 10),
    maxLeverage: num('MAX_LEVERAGE', 3),
    totalCapitalUsdt: num('TOTAL_CAPITAL_USDT', 1000),

    notionApiKey: required('NOTION_API_KEY'),
    notionDatabaseId: required('NOTION_DATABASE_ID'),
    notionReportHour: num('NOTION_REPORT_HOUR', 9),
    notionReportMinute: num('NOTION_REPORT_MINUTE', 0),

    runtimeTimezone: process.env['RUNTIME_TIMEZONE'] ?? 'Asia/Shanghai',
    tradingPairs: list('TRADING_PAIRS', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']),

    signalScanIntervalMs: num('SIGNAL_SCAN_INTERVAL_MS', 1800000),
    signalBuyThreshold: num('SIGNAL_BUY_THRESHOLD', 30),
    signalSellThreshold: num('SIGNAL_SELL_THRESHOLD', -30),

    signalWeights: {
      rsi: num('SIGNAL_W_RSI', 25),
      ema: num('SIGNAL_W_EMA', 20),
      trend: num('SIGNAL_W_TREND', 15),
      sentiment: num('SIGNAL_W_SENTIMENT', 20),
      funding: num('SIGNAL_W_FUNDING', 10),
      risk: num('SIGNAL_W_RISK', 10),
    },

    anomalyScanIntervalMs: num('ANOMALY_SCAN_INTERVAL_MS', 1800000),
    anomalyPriceChangePct: num('ANOMALY_PRICE_CHANGE_PCT', 8),
    anomalyFundingRatePct: num('ANOMALY_FUNDING_RATE_PCT', 0.1),
    anomalyOiChangePct: num('ANOMALY_OI_CHANGE_PCT', 20),

    fundingScanIntervalMs: num('FUNDING_SCAN_INTERVAL_MS', 600000),
    fundingHighThreshold: num('FUNDING_HIGH_THRESHOLD', 0.05),
    fundingLowThreshold: num('FUNDING_LOW_THRESHOLD', -0.05),

    tnCacheTtlMs: num('TN_CACHE_TTL_MS', 1800000),
    tnMaxRetries: num('TN_MAX_RETRIES', 3),
  }
}
