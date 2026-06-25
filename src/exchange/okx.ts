import ccxt, { type Exchange } from 'ccxt'
import type { RuntimeConfig, PriceSnapshot, FundingRateSnapshot, Kline } from '../core/types.js'
import type { IExchange } from '../core/types.js'

export class OKXExchange implements IExchange {
  private exchange: Exchange
  private config: RuntimeConfig
  private priceCache = new Map<string, PriceSnapshot>()
  private fundingCache = new Map<string, FundingRateSnapshot>()

  constructor(config: RuntimeConfig) {
    this.config = config
    this.exchange = new ccxt.okx({
      apiKey: config.exchangeApiKey,
      secret: config.exchangeSecretKey,
      password: config.exchangePassword,
      enableRateLimit: true,
      options: { defaultType: 'swap' },
    })
    if (config.exchangeTestnet) this.exchange.setSandboxMode(true)
  }

  async init(): Promise<void> {
    await this.exchange.loadMarkets()
    console.log(`[OKX] Connected. Provider: okx`)
  }

  async getPrice(symbol: string): Promise<PriceSnapshot | null> {
    try {
      const okxSymbol = `${symbol.replace('USDT', '')}/USDT:USDT`
      const t = await this.exchange.fetchTicker(okxSymbol)
      const s: PriceSnapshot = { symbol, bid: t.bid ?? 0, ask: t.ask ?? 0, last: t.last ?? 0, timestamp: t.timestamp ?? Date.now() }
      this.priceCache.set(symbol, s)
      return s
    } catch {
      return this.priceCache.get(symbol) ?? null
    }
  }

  async getFundingRate(symbol: string): Promise<FundingRateSnapshot | null> {
    try {
      const okxSymbol = `${symbol.replace('USDT', '')}/USDT:USDT`
      const r = await this.exchange.fetchFundingRate(okxSymbol)
      const s: FundingRateSnapshot = {
        symbol,
        fundingRate: (r.fundingRate ?? 0) * 100,
        nextFundingTime: r.nextFundingTimestamp ?? 0,
        timestamp: r.timestamp ?? Date.now(),
      }
      this.fundingCache.set(symbol, s)
      return s
    } catch {
      return this.fundingCache.get(symbol) ?? null
    }
  }

  async getKlines(symbol: string, timeframe = '1h', limit = 100): Promise<Kline[]> {
    try {
      const okxSymbol = `${symbol.replace('USDT', '')}/USDT:USDT`
      const res = await this.exchange.fetchOHLCV(okxSymbol, timeframe, undefined, limit)
      return res.map((k: unknown) => {
        const arr = k as [number, number, number, number, number, number]
        return {
          timestamp: arr[0], open: arr[1], high: arr[2], low: arr[3], close: arr[4], volume: arr[5],
        }
      })
    } catch {
      return []
    }
  }

  async getAllFundingRates(symbols: string[]): Promise<Map<string, FundingRateSnapshot>> {
    const results = await Promise.allSettled(symbols.map(s => this.getFundingRate(s)))
    const map = new Map<string, FundingRateSnapshot>()
    results.forEach((r, i) => { if (r.status === 'fulfilled' && r.value) map.set(symbols[i], r.value) })
    return map
  }

  async getAllPrices(symbols: string[]): Promise<Map<string, PriceSnapshot>> {
    const results = await Promise.allSettled(symbols.map(s => this.getPrice(s)))
    const map = new Map<string, PriceSnapshot>()
    results.forEach((r, i) => { if (r.status === 'fulfilled' && r.value) map.set(symbols[i], r.value) })
    return map
  }

  async placeMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, reduceOnly = false): Promise<string | null> {
    try {
      const okxSymbol = `${symbol.replace('USDT', '')}/USDT:USDT`
      const params: Record<string, unknown> = {}
      if (reduceOnly) params.reduceOnly = true
      const o = await this.exchange.createMarketOrder(okxSymbol, side, amount, undefined, params)
      console.log(`[OKX] Market ${side} ${amount} ${symbol} -> ${o.id}`)
      return o.id as string
    } catch (err) {
      console.error(`[OKX] placeMarketOrder ${symbol} error:`, err)
      return null
    }
  }

  async placeLimitOrder(symbol: string, side: 'buy' | 'sell', amount: number, price: number, reduceOnly = false, postOnly = false): Promise<string | null> {
    try {
      const okxSymbol = `${symbol.replace('USDT', '')}/USDT:USDT`
      const params: Record<string, unknown> = {}
      if (reduceOnly) params.reduceOnly = true
      if (postOnly) params.postOnly = true
      const o = await this.exchange.createLimitOrder(okxSymbol, side, amount, price, params)
      console.log(`[OKX] Limit ${side} ${amount} ${symbol} @${price} -> ${o.id}`)
      return o.id as string
    } catch (err) {
      console.error(`[OKX] placeLimitOrder ${symbol} error:`, err)
      return null
    }
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    try {
      const okxSymbol = `${symbol.replace('USDT', '')}/USDT:USDT`
      const formattedSymbol = `${symbol.replace('USDT', '')}-USDT-SWAP`
      await this.exchange.setLeverage(leverage, formattedSymbol)
    } catch { /* ignore */ }
  }

  getLotSize(symbol: string): { min: number; step: number } {
    const m = this.exchange.markets[`${symbol.replace('USDT', '')}/USDT:USDT`]
    if (!m) return { min: 0.001, step: 0.001 }
    return { min: m.limits?.amount?.min ?? 0.001, step: m.precision?.amount ?? 0.001 }
  }

  getMinNotional(symbol: string): number {
    const m = this.exchange.markets[`${symbol.replace('USDT', '')}/USDT:USDT`]
    if (!m) return 5
    const info = (m as { info?: Record<string, unknown> }).info
    if (info?.minNotional) return Number(info.minNotional)
    return 5
  }
}
