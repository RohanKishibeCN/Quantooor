import type { RuntimeConfig, SystemState, ScoreResult } from '../core/types.js'
import { TrueNorthClient } from '../truenorth/client.js'

export async function runScorer(
  config: RuntimeConfig,
  state: SystemState,
  tn: TrueNorthClient,
): Promise<ScoreResult[]> {
  const now = Date.now()
  if (now - state.lastSignalTime < config.signalScanIntervalMs) return []

  const tnSnapshot = state.lastTnAnalysis
  if (!tnSnapshot) return []

  state.lastSignalTime = now
  const scores: ScoreResult[] = []
  const w = config.signalWeights

  for (const pair of config.tradingPairs) {
    const tokenData = tnSnapshot.perToken.get(pair)
    const klines = tn.getCachedKlines(pair)
    const ind = klines.length >= 50 ? await tn.getIndicators(klines) : null

    const factors: Record<string, number> = {}

    if (ind) {
      const rawRsi = ind.rsi14
      factors['rsi'] = (rawRsi > 40 && rawRsi < 60 ? 1.5 : rawRsi > 30 && rawRsi < 40 ? 0.5 : rawRsi < 30 ? -2 : 0) * w.rsi
    } else if (klines.length > 0) {
      factors['rsi'] = 0
    } else {
      factors['rsi'] = tokenData?.rsi && tokenData.rsi !== 50
        ? ((tokenData.rsi > 40 && tokenData.rsi < 60 ? 1.5 : tokenData.rsi > 30 && tokenData.rsi < 40 ? 0.5 : tokenData.rsi < 30 ? -2 : 0) * w.rsi)
        : 0
    }

    if (ind) {
      factors['ema'] = (ind.ema9 > ind.ema21 ? 1 : -1) * w.ema
    } else {
      factors['ema'] = 0
    }

    if (tokenData) {
      factors['trend'] = (tokenData.trend === 'up' ? 1 : tokenData.trend === 'down' ? -1 : 0) * w.trend
      factors['sentiment'] = (tokenData.sentiment === 'bullish' ? 1 : tokenData.sentiment === 'bearish' ? -1 : 0) * w.sentiment
      const fr = tokenData.fundingRate
      factors['funding'] = (Math.abs(fr) < 0.01 ? 1 : Math.abs(fr) < 0.05 ? 0.5 : -1) * w.funding
    } else {
      factors['trend'] = 0
      factors['sentiment'] = 0
      factors['funding'] = 0
    }

    factors['risk'] = (tnSnapshot.riskLevel === 'low' ? 1 : tnSnapshot.riskLevel === 'high' ? -1 : 0) * w.risk

    const score = Object.values(factors).reduce((a, b) => a + b, 0)

    let direction: ScoreResult['direction'] = 'neutral'
    let strength: ScoreResult['strength'] = 'hold'
    if (score >= config.signalBuyThreshold) {
      direction = 'buy'
      strength = score >= config.signalBuyThreshold * 1.5 ? 'strong_buy' : 'buy'
    } else if (score <= config.signalSellThreshold) {
      direction = 'sell'
      strength = score <= config.signalSellThreshold * 1.5 ? 'strong_sell' : 'sell'
    }

    const reason = `RSI:${factors['rsi']?.toFixed(1) ?? '0'}, EMA:${factors['ema']?.toFixed(1) ?? '0'}, Trend:${factors['trend']?.toFixed(1) ?? '0'}, Sent:${factors['sentiment']?.toFixed(1) ?? '0'}, Fund:${factors['funding']?.toFixed(1) ?? '0'}, Risk:${factors['risk']?.toFixed(1) ?? '0'}`
    scores.push({ symbol: pair, score, direction, strength, factors, reason })
    console.log(`[Scorer] ${pair}: score=${score.toFixed(1)} ${strength} | ${reason}`)
  }

  state.signals = scores
  return scores
}
