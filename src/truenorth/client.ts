import type { RuntimeConfig, TrueNorthAnalysis, TechnicalIndicators, Kline, MarketRegime } from '../core/types.js'
import { MarketRegime as MR } from '../core/types.js'
import { MCPClient } from './mcp-client.js'

interface MarketScanResult {
  status: string
  trending?: { trending: Array<{ name: string; symbol: string }> }
  performance?: {
    summary?: string
    signalCounts?: Record<string, number>
    signals?: Record<string, string[]>
  }
}

interface TechAnalysisResult {
  status?: string
  summary?: string
  technical_analysis?: { indicators?: Record<string, unknown> }
  kline_analysis?: unknown
  token_metadata?: { token_address?: string }
}

interface BarsResult {
  status?: string
  data?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>
}

const TOKEN_MAP: Record<string, string> = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  BNBUSDT: 'binancecoin',
}

const TOKEN_REVERSE: Record<string, string> = {
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
  solana: 'SOLUSDT',
  binancecoin: 'BNBUSDT',
}

export class TrueNorthClient {
  private config: RuntimeConfig
  private mcp: MCPClient
  private cache: TrueNorthAnalysis | null = null
  private cacheTime = 0

  constructor(config: RuntimeConfig) {
    this.config = config
    this.mcp = new MCPClient(config.truenorthMcpUrl)
  }

  async fetchMarketSnapshot(): Promise<TrueNorthAnalysis> {
    const now = Date.now()
    if (this.cache && (now - this.cacheTime) < this.config.tnCacheTtlMs) {
      return this.cache
    }

    const analysis = await this.fetchFromMCP()
    this.cache = analysis
    this.cacheTime = now
    return analysis
  }

  async getIndicators(klines: Kline[]): Promise<TechnicalIndicators | null> {
    if (klines.length < 50) return null
    const closes = klines.map(k => k.close)
    return {
      rsi14: this.rsv(closes, 14),
      ema9: this.ema(closes, 9),
      ema21: this.ema(closes, 21),
      ema50: this.ema(closes, 50),
      macd: this.macd(closes),
      bbUpper: this.bb(closes).upper,
      bbLower: this.bb(closes).lower,
      bbMiddle: this.bb(closes).middle,
    }
  }

  detectRegime(ind: TechnicalIndicators, klines: Kline[]): MarketRegime {
    const closes = klines.map(k => k.close)
    const last = closes[closes.length - 1]
    const prev = closes[closes.length - 20] ?? closes[0]
    const change = ((last - prev) / prev) * 100
    const atr = this.atr(klines, 14)
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length
    if ((atr / avg) * 100 > 5) return MR.VOLATILE
    if (change > 8 && ind.rsi14 > 60) return MR.TRENDING_UP
    if (change < -8 && ind.rsi14 < 40) return MR.TRENDING_DOWN
    return MR.RANGING
  }

  private async fetchFromMCP(): Promise<TrueNorthAnalysis> {
    const perToken = new Map<string, { price: number; rsi: number; trend: string; sentiment: string; fundingRate: number }>()
    let regime = MR.RANGING
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral'
    let riskLevel: 'low' | 'medium' | 'high' = 'medium'
    let riskReason = 'No MCP data'
    let topGainers: string[] = []
    let topLosers: string[] = []
    let sectorRotation: string[] = []

    try {
      const scan = await this.mcp.callTool<MarketScanResult>('combo_market_scan')
      if (scan?.status === 'success') {
        const perf = scan.performance
        if (perf?.signals?.strong_buy) topGainers = perf.signals.strong_buy.slice(0, 5)
        if (perf?.signals?.buy) topLosers = perf.signals.buy.slice(0, 3)

        if (perf?.signalCounts) {
          const strong = perf.signalCounts.STRONG_BUY ?? 0
          const buy = perf.signalCounts.BUY ?? 0
          const weak = (perf.signalCounts.WEAK ?? 0) + (perf.signalCounts.UNDERPERFORMING ?? 0)

          if (strong > buy && strong > weak) {
            sentiment = 'bullish'
            regime = MR.TRENDING_UP
            riskLevel = 'low'
          } else if (weak > strong + buy) {
            sentiment = 'bearish'
            regime = MR.TRENDING_DOWN
            riskLevel = 'medium'
          } else {
            sentiment = 'neutral'
            regime = MR.RANGING
          }
          riskReason = `${strong} strong_buy, ${buy} buy, ${weak} weak signals`
        }
      }
    } catch {
      // fallback to defaults
    }

    try {
      const allTokenIds = this.config.tradingPairs.map(s => TOKEN_MAP[s] ?? '').filter(Boolean)

      for (const id of allTokenIds) {
        const bars = await this.mcp.callTool<BarsResult>('historical_bars', {
          instruments: id,
          asset_class: 'crypto',
          timeframe: '1h',
          instrument_type: 'perp',
          limit: 100,
        })

        if (bars?.data && bars.data.length > 0) {
          const klines: Kline[] = bars.data.map(d => ({
            timestamp: d.timestamp,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume,
          }))

          const price = klines[klines.length - 1].close
          const first = klines[0].close
          const ind = await this.getIndicators(klines)
          const trend = price > first ? 'up' : 'down'

          const pair = TOKEN_REVERSE[id] ?? id.toUpperCase()
          perToken.set(pair, {
            price,
            rsi: ind?.rsi14 ?? 50,
            trend,
            sentiment,
            fundingRate: 0.01,
          })
        }
      }
    } catch {
      // fallback: perToken stays empty, will use defaults
    }

    return {
      timestamp: Date.now(),
      regime,
      sentiment,
      riskLevel,
      riskReason,
      marketScan: { topGainers, topLosers, sectorRotation },
      perToken,
    }
  }

  private rsv(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50
    const changes = closes.slice(1).map((c, i) => c - closes[i])
    const recent = changes.slice(-period)
    const gains = recent.filter(c => c > 0).reduce((a, b) => a + b, 0) / period
    const losses = recent.filter(c => c < 0).map(c => Math.abs(c)).reduce((a, b) => a + b, 0) / period
    if (losses === 0) return 100
    return 100 - 100 / (1 + gains / losses)
  }

  private ema(closes: number[], period: number): number {
    if (closes.length < period) return closes[closes.length - 1]
    const k = 2 / (period + 1)
    let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
    for (let i = period; i < closes.length; i++) e = closes[i] * k + e * (1 - k)
    return e
  }

  private macd(closes: number[]): { macd: number; signal: number; histogram: number } {
    const e12 = this.ema(closes, 12)
    const e26 = this.ema(closes, 26)
    const m = e12 - e26
    const vals: number[] = []
    for (let i = 9; i <= closes.length; i++) {
      const s = closes.slice(0, i)
      vals.push(this.ema(s, 12) - this.ema(s, 26))
    }
    const sig = vals.length > 0 ? this.ema(vals, 9) : 0
    return { macd: m, signal: sig, histogram: m - sig }
  }

  private bb(closes: number[], period = 20, mult = 2): { upper: number; middle: number; lower: number } {
    const slice = closes.slice(-period)
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length
    const std = Math.sqrt(variance)
    return { upper: mean + mult * std, middle: mean, lower: mean - mult * std }
  }

  private atr(klines: Kline[], period: number): number {
    if (klines.length < period + 1) return 0
    const trs: number[] = []
    for (let i = 1; i < klines.length; i++) {
      trs.push(Math.max(
        klines[i].high - klines[i].low,
        Math.abs(klines[i].high - klines[i - 1].close),
        Math.abs(klines[i].low - klines[i - 1].close),
      ))
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period
  }
}
