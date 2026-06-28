import type { RuntimeConfig, SystemState, FundingSnapshot, TrueNorthAnalysis } from '../core/types.js'
import type { IExchange } from '../core/types.js'

export async function runFundingWatch(
  config: RuntimeConfig,
  state: SystemState,
  tnSnapshot: TrueNorthAnalysis,
  exchange: IExchange | null
): Promise<FundingSnapshot[]> {
  const now = Date.now()
  if (now - state.lastFundingTime < config.fundingScanIntervalMs) return []
  state.lastFundingTime = now

  const snapshots: FundingSnapshot[] = []

  for (const pair of config.tradingPairs) {
    const tokenData = tnSnapshot.perToken.get(pair)
    const rate = tokenData?.fundingRate ?? 0

    let level: FundingSnapshot['level'] = 'normal'
    let label = ''

    if (rate > config.fundingHighThreshold) {
      level = 'high'; label = '过热，空头有利'
    } else if (rate < config.fundingLowThreshold) {
      level = 'low'; label = '恐慌，多头有利'
    } else if (rate > 0.01) {
      level = 'normal_high'; label = '正常偏多'
    } else if (rate < -0.01) {
      level = 'normal_low'; label = '正常偏空'
    } else {
      label = '正常'
    }

    snapshots.push({ symbol: pair, rate, level, label })
    console.log(`[Funding] ${pair}: ${rate.toFixed(3)}% → ${label}`)
  }

  if (exchange) {
    const rates = await exchange.getAllFundingRates(config.tradingPairs)
    for (const [pair, rate] of rates) {
      const idx = snapshots.findIndex(s => s.symbol === pair)
      if (idx >= 0) snapshots[idx].rate = rate.fundingRate
    }
  }

  state.fundingSnapshots = snapshots
  return snapshots
}
