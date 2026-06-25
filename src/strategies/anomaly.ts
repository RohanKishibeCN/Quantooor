import type { RuntimeConfig, SystemState, AnomalyEvent, TrueNorthAnalysis, Kline } from '../core/types.js'
import type { IExchange } from '../core/types.js'

export async function runAnomalyScan(
  config: RuntimeConfig,
  state: SystemState,
  tnSnapshot: TrueNorthAnalysis,
  exchange: IExchange | null,
  klinesMap: Map<string, Kline[]>
): Promise<AnomalyEvent[]> {
  const now = Date.now()
  if (now - state.lastAnomalyTime < config.anomalyScanIntervalMs) return []
  state.lastAnomalyTime = now

  const events: AnomalyEvent[] = []

  for (const pair of config.tradingPairs) {
    const klines = klinesMap.get(pair)
    if (!klines || klines.length < 24) continue

    const last = klines[klines.length - 1]
    const first = klines[0]
    const priceChg = ((last.close - first.close) / first.close) * 100

    if (Math.abs(priceChg) > config.anomalyPriceChangePct) {
      events.push({
        symbol: pair,
        type: 'price',
        detail: `24h ${priceChg > 0 ? '+' : ''}${priceChg.toFixed(1)}%`,
        timestamp: now,
      })
      console.log(`[Anomaly] ${pair}: 24h change ${priceChg.toFixed(1)}%`)
    }
  }

  if (exchange) {
    const rates = await exchange.getAllFundingRates(config.tradingPairs)
    for (const [pair, rate] of rates) {
      if (Math.abs(rate.fundingRate) > config.anomalyFundingRatePct) {
        events.push({
          symbol: pair,
          type: 'funding',
          detail: `Funding rate ${rate.fundingRate > 0 ? '+' : ''}${rate.fundingRate.toFixed(3)}%`,
          timestamp: now,
        })
      }
    }
  }

  if (tnSnapshot.marketScan.topGainers.length > 0) {
    for (const g of tnSnapshot.marketScan.topGainers.slice(0, 3)) {
      events.push({ symbol: g, type: 'hot', detail: 'Top gainer via TrueNorth Market Scan', timestamp: now })
    }
  }

  state.anomalies = events
  return events
}
