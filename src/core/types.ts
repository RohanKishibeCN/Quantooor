export enum OrderSide {
  BUY = 'buy',
  SELL = 'sell',
}

export enum PositionSide {
  LONG = 'long',
  SHORT = 'short',
}

export enum MarketRegime {
  TRENDING_UP = 'trending_up',
  TRENDING_DOWN = 'trending_down',
  RANGING = 'ranging',
  VOLATILE = 'volatile',
}

export interface PriceSnapshot {
  symbol: string
  bid: number
  ask: number
  last: number
  timestamp: number
}

export interface FundingRateSnapshot {
  symbol: string
  fundingRate: number
  nextFundingTime: number
  timestamp: number
}

export interface Kline {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface TechnicalIndicators {
  rsi14: number
  ema9: number
  ema21: number
  ema50: number
  macd: { macd: number; signal: number; histogram: number }
  bbUpper: number
  bbLower: number
  bbMiddle: number
}

export interface TrueNorthAnalysis {
  timestamp: number
  regime: MarketRegime
  sentiment: 'bullish' | 'bearish' | 'neutral'
  riskLevel: 'low' | 'medium' | 'high'
  riskReason: string
  marketScan: {
    topGainers: string[]
    topLosers: string[]
    sectorRotation: string[]
  }
  perToken: Map<string, {
    price: number
    rsi: number
    trend: string
    sentiment: string
    fundingRate: number
  }>
}

export interface ScoreResult {
  symbol: string
  score: number
  direction: 'buy' | 'sell' | 'neutral'
  strength: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell'
  factors: Record<string, number>
  reason: string
}

export interface AnomalyEvent {
  symbol: string
  type: 'price' | 'funding' | 'oi' | 'hot'
  detail: string
  timestamp: number
}

export interface FundingSnapshot {
  symbol: string
  rate: number
  level: 'high' | 'normal_high' | 'normal' | 'normal_low' | 'low'
  label: string
}

export interface DailyReport {
  date: string
  marketEnvironment: {
    regime: string
    sentiment: string
    riskLevel: string
    riskReason: string
    sectorRotation: string[]
  }
  signals: ScoreResult[]
  anomalies: AnomalyEvent[]
  fundingSnapshots: FundingSnapshot[]
}

export interface TradeOrder {
  symbol: string
  side: OrderSide
  positionSide: PositionSide
  amount: number
  price: number
  type: 'market' | 'limit'
  reduceOnly: boolean
  stopLoss?: number
  takeProfit?: number
  reason: string
  confidence: number
  timestamp: number
}

export interface TradeRecord {
  id: string
  symbol: string
  side: OrderSide
  positionSide: PositionSide
  amount: number
  entryPrice: number
  exitPrice?: number
  pnl?: number
  pnlPercent?: number
  entryTime: number
  exitTime?: number
  status: 'open' | 'closed' | 'cancelled'
  reason: string
}

export interface IExchange {
  init(): Promise<void>
  getPrice(symbol: string): Promise<PriceSnapshot | null>
  getFundingRate(symbol: string): Promise<FundingRateSnapshot | null>
  getKlines(symbol: string, timeframe?: string, limit?: number): Promise<Kline[]>
  getAllFundingRates(symbols: string[]): Promise<Map<string, FundingRateSnapshot>>
  getAllPrices(symbols: string[]): Promise<Map<string, PriceSnapshot>>
  placeMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, reduceOnly?: boolean): Promise<string | null>
  placeLimitOrder(symbol: string, side: 'buy' | 'sell', amount: number, price: number, reduceOnly?: boolean, postOnly?: boolean): Promise<string | null>
  setLeverage(symbol: string, leverage: number): Promise<void>
  getLotSize(symbol: string): { min: number; step: number }
  getMinNotional(symbol: string): number
}

export interface RuntimeConfig {
  truenorthMcpUrl: string
  claudeApiKey: string
  claudeModel: string
  exchangeEnabled: boolean
  exchangeProvider: 'binance' | 'okx'
  exchangeApiKey: string
  exchangeSecretKey: string
  exchangePassword: string
  exchangeTestnet: boolean
  dryRun: boolean
  autoTradeEnabled: boolean
  maxPositionPct: number
  maxConcurrentPositions: number
  maxDailyLossPct: number
  minSignalConfidence: number
  tradeMinNotionalUsdt: number
  maxLeverage: number
  totalCapitalUsdt: number
  notionApiKey: string
  notionDatabaseId: string
  notionTitleProp: string
  notionDateProp: string
  notionContentProp: string
  notionReportHour: number
  notionReportMinute: number
  runtimeTimezone: string
  tradingPairs: string[]
  signalScanIntervalMs: number
  signalBuyThreshold: number
  signalSellThreshold: number
  signalWeights: { rsi: number; ema: number; trend: number; sentiment: number; funding: number; risk: number }
  anomalyScanIntervalMs: number
  anomalyPriceChangePct: number
  anomalyFundingRatePct: number
  anomalyOiChangePct: number
  fundingScanIntervalMs: number
  fundingHighThreshold: number
  fundingLowThreshold: number
  tnCacheTtlMs: number
  tnMaxRetries: number
}

export interface SystemState {
  startTime: number
  lastReportTime: number
  lastSignalTime: number
  lastAnomalyTime: number
  lastFundingTime: number
  signals: ScoreResult[]
  anomalies: AnomalyEvent[]
  fundingSnapshots: FundingSnapshot[]
  lastTnAnalysis: TrueNorthAnalysis | null
  lastTnAnalysisTime: number
  openOrders: TradeRecord[]
  tradeHistory: TradeRecord[]
  dailyPnl: number
  totalPnl: number
  isPaused: boolean
  pauseReason: string
}
