import type { RuntimeConfig, TrueNorthAnalysis, TechnicalIndicators, Kline } from '../core/types.js'
import { MarketRegime } from '../core/types.js'

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>
}

export class TrueNorthClient {
  private config: RuntimeConfig
  private cache: TrueNorthAnalysis | null = null
  private cacheTime = 0

  constructor(config: RuntimeConfig) {
    this.config = config
  }

  async fetchMarketSnapshot(klinesMap?: Map<string, Kline[]>): Promise<TrueNorthAnalysis> {
    const now = Date.now()
    if (this.cache && (now - this.cacheTime) < this.config.tnCacheTtlMs) {
      return this.cache
    }

    try {
      const prompt = this.buildSnapshotPrompt(klinesMap)
      const json = await this.callClaude(prompt, this.config.tnMaxRetries)
      const analysis = this.parseSnapshot(json)
      this.cache = analysis
      this.cacheTime = now
      console.log(`[TrueNorth] Snapshot: regime=${analysis.regime}, sentiment=${analysis.sentiment}, risk=${analysis.riskLevel}`)
      return analysis
    } catch (err) {
      console.error('[TrueNorth] Snapshot failed:', err)
      if (this.cache) return this.cache
      return this.defaultSnapshot()
    }
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
    if ((atr / avg) * 100 > 5) return MarketRegime.VOLATILE
    if (change > 8 && ind.rsi14 > 60) return MarketRegime.TRENDING_UP
    if (change < -8 && ind.rsi14 < 40) return MarketRegime.TRENDING_DOWN
    return MarketRegime.RANGING
  }

  private buildSnapshotPrompt(klinesMap?: Map<string, Kline[]>): string {
    const pairs: string[] = []
    if (klinesMap) {
      for (const [sym, kls] of klinesMap) {
        if (kls.length < 10) continue
        const last = kls[kls.length - 1]
        const first = kls[0]
        const chg = (((last.close - first.close) / first.close) * 100).toFixed(2)
        pairs.push(`${sym}: price=${last.close}, 24hChg=${chg}%`)
      }
    }

    return `You are a crypto market analyst. Using TrueNorth MCP tools, analyze:
${this.config.tradingPairs.join(', ')}

${pairs.length > 0 ? `Recent data:\n${pairs.join('\n')}\n` : ''}
Return ONLY valid JSON:
{
  "regime": "trending_up|trending_down|ranging|volatile",
  "sentiment": "bullish|bearish|neutral",
  "riskLevel": "low|medium|high",
  "riskReason": "brief reason",
  "marketScan": { "topGainers": [], "topLosers": [], "sectorRotation": [] },
  "perToken": {
    "BTCUSDT": { "price": 0, "rsi": 50, "trend": "neutral", "sentiment": "neutral", "fundingRate": 0.01 }
  }
}`
  }

  private async callClaude(prompt: string, maxRetries: number): Promise<string> {
    let lastErr: Error | null = null
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.claudeApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.config.claudeModel,
            max_tokens: 2048,
            system: 'You use TrueNorth MCP tools. Return ONLY valid JSON, no markdown, no explanation.',
            messages: [{ role: 'user', content: prompt }],
          }),
        })

        if (!res.ok) {
          const body = await res.text()
          throw new Error(`HTTP ${res.status}: ${body}`)
        }

        const data = await res.json() as ClaudeResponse
        const text = data.content.find(c => c.type === 'text')?.text ?? ''
        const match = text.match(/\{[\s\S]*\}/)
        return match ? match[0] : text
      } catch (err) {
        lastErr = err as Error
        await new Promise(r => setTimeout(r, 2000 * (i + 1)))
      }
    }
    throw lastErr ?? new Error('Claude API failed')
  }

  private parseSnapshot(json: string): TrueNorthAnalysis {
    try {
      const d = JSON.parse(json)
      const regimeStr = (d.regime ?? 'ranging') as string
      let regime = MarketRegime.RANGING
      if (regimeStr === 'trending_up') regime = MarketRegime.TRENDING_UP
      else if (regimeStr === 'trending_down') regime = MarketRegime.TRENDING_DOWN
      else if (regimeStr === 'volatile') regime = MarketRegime.VOLATILE

      const perToken = new Map<string, { price: number; rsi: number; trend: string; sentiment: string; fundingRate: number }>()
      if (d.perToken) {
        for (const [k, v] of Object.entries(d.perToken)) {
          perToken.set(k, v as { price: number; rsi: number; trend: string; sentiment: string; fundingRate: number })
        }
      }
      return {
        timestamp: Date.now(),
        regime,
        sentiment: d.sentiment ?? 'neutral',
        riskLevel: d.riskLevel ?? 'medium',
        riskReason: d.riskReason ?? 'No data',
        marketScan: {
          topGainers: d.marketScan?.topGainers ?? [],
          topLosers: d.marketScan?.topLosers ?? [],
          sectorRotation: d.marketScan?.sectorRotation ?? [],
        },
        perToken,
      }
    } catch {
      return this.defaultSnapshot()
    }
  }

  private defaultSnapshot(): TrueNorthAnalysis {
    const perToken = new Map<string, { price: number; rsi: number; trend: string; sentiment: string; fundingRate: number }>()
    for (const p of this.config.tradingPairs) {
      perToken.set(p, { price: 0, rsi: 50, trend: 'neutral', sentiment: 'neutral', fundingRate: 0.01 })
    }
    return {
      timestamp: Date.now(),
      regime: MarketRegime.RANGING,
      sentiment: 'neutral',
      riskLevel: 'medium',
      riskReason: 'Default fallback',
      marketScan: { topGainers: [], topLosers: [], sectorRotation: [] },
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
    const s = this.ema(vals, 9)
    return { macd: m, signal: s, histogram: m - s }
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
