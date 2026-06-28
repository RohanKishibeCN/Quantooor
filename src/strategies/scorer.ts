import type { RuntimeConfig, SystemState, ScoreResult, TrueNorthAnalysis, TechnicalIndicators } from '../core/types.js'
import type { IExchange } from '../core/types.js'
import { TrueNorthClient } from '../truenorth/client.js'

export async function runScorer(
  config: RuntimeConfig,
  state: SystemState,
  tn: TrueNorthClient,
  exchange: IExchange | null,
): Promise<ScoreResult[]> {
  const now = Date.now()
  if (now - state.lastSignalTime < config.signalScanIntervalMs) return []

  const tnSnapshot = await tn.fetchMarketSnapshot()
  state.lastTnAnalysis = tnSnapshot
  state.lastTnAnalysisTime = now
  state.lastSignalTime = now

  const scores: ScoreResult[] = []

  for (const pair of config.tradingPairs) {
    const tokenData = tnSnapshot.perToken.get(pair)
    const klines = tn.getCachedKlines(pair)
    const ind = await tn.getIndicators(klines)

    const factors: Record<string, number> = {}
    let score = 0

    const w = config.signalWeights

    if (ind) {
      const rsiScore = ind.rsi14 > 40 && ind.rsi14 < 60 ? 1.5 : ind.rsi14 > 30 && ind.rsi14 < 40 ? 0.5 : ind.rsi14 < 30 ? -2 : 0
      factors['rsi'] = rsiScore * w.rsi
      score += factors['rsi']

      const emaScore = ind.ema9 > ind.ema21 ? 1 : -1
      factors['ema'] = emaScore * w.ema
      score += factors['ema']
    } else {
      factors['rsi'] = 0
      factors['ema'] = 0
    }

    if (tokenData) {
      const trendScore = tokenData.trend === 'up' ? 1 : tokenData.trend === 'down' ? -1 : 0
      factors['trend'] = trendScore * w.trend
      score += factors['trend']

      const sentScore = tokenData.sentiment === 'bullish' ? 1 : tokenData.sentiment === 'bearish' ? -1 : 0
      factors['sentiment'] = sentScore * w.sentiment
      score += factors['sentiment']

      const fundingR = tokenData.fundingRate
      const fundScore = Math.abs(fundingR) < 0.01 ? 1 : Math.abs(fundingR) < 0.05 ? 0.5 : -1
      factors['funding'] = fundScore * w.funding
      score += factors['funding']
    } else {
      factors['trend'] = 0
      factors['sentiment'] = 0
      factors['funding'] = 0
    }

    const riskScore = tnSnapshot.riskLevel === 'low' ? 1 : tnSnapshot.riskLevel === 'high' ? -1 : 0
    factors['risk'] = riskScore * w.risk
    score += factors['risk']

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
    console.log(`[Scorer] ${pair}: score=${score} ${strength} | ${reason}`)
  }

  state.signals = scores
  return scores
}
