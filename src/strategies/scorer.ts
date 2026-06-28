import type { RuntimeConfig, SystemState, ScoreResult, TrueNorthAnalysis, TechnicalIndicators, Kline } from '../core/types.js'
import type { IExchange } from '../core/types.js'
import { TrueNorthClient } from '../truenorth/client.js'

export async function runScorer(
  config: RuntimeConfig,
  state: SystemState,
  tn: TrueNorthClient,
  exchange: IExchange | null,
  klinesMap: Map<string, Kline[]>
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
    const klines = klinesMap.get(pair) ?? []
    const ind = await tn.getIndicators(klines)

    const factors: Record<string, number> = {}
    let score = 0

    if (ind) {
      const rsiScore = ind.rsi14 > 40 && ind.rsi14 < 60 ? 15 : ind.rsi14 > 30 && ind.rsi14 < 40 ? 5 : ind.rsi14 < 30 ? -15 : 0
      factors['rsi'] = (rsiScore / 100) * config.signalWeights.rsi
      score += factors['rsi']

      const emaScore = ind.ema9 > ind.ema21 ? 10 : -10
      factors['ema'] = (emaScore / 100) * config.signalWeights.ema
      score += factors['ema']
    } else {
      factors['rsi'] = 0
      factors['ema'] = 0
    }

    if (tokenData) {
      const trendScore = tokenData.trend === 'up' ? 10 : tokenData.trend === 'down' ? -10 : 5
      factors['trend'] = (trendScore / 100) * config.signalWeights.trend
      score += factors['trend']

      const sentScore = tokenData.sentiment === 'bullish' ? 10 : tokenData.sentiment === 'bearish' ? -10 : 5
      factors['sentiment'] = (sentScore / 100) * config.signalWeights.sentiment
      score += factors['sentiment']

      const fundingR = tokenData.fundingRate
      const fundScore = Math.abs(fundingR) < 0.01 ? 10 : Math.abs(fundingR) < 0.05 ? 5 : -10
      factors['funding'] = (fundScore / 100) * config.signalWeights.funding
      score += factors['funding']
    } else {
      factors['trend'] = 0
      factors['sentiment'] = 0
      factors['funding'] = 0
    }

    const riskScore = tnSnapshot.riskLevel === 'low' ? 10 : tnSnapshot.riskLevel === 'high' ? -10 : 0
    factors['risk'] = (riskScore / 100) * config.signalWeights.risk
    score += factors['risk']

    let direction: ScoreResult['direction'] = 'neutral'
    let strength: ScoreResult['strength'] = 'hold'

    if (score >= config.signalBuyThreshold) {
      direction = 'buy'
      strength = score >= config.signalBuyThreshold + 15 ? 'strong_buy' : 'buy'
    } else if (score <= config.signalSellThreshold) {
      direction = 'sell'
      strength = score <= config.signalSellThreshold - 15 ? 'strong_sell' : 'sell'
    }

    const reason = `RSI:${factors['rsi']?.toFixed(1) ?? '0'}, EMA:${factors['ema']?.toFixed(1) ?? '0'}, Trend:${factors['trend']?.toFixed(1) ?? '0'}, Sent:${factors['sentiment']?.toFixed(1) ?? '0'}, Fund:${factors['funding']?.toFixed(1) ?? '0'}, Risk:${factors['risk']?.toFixed(1) ?? '0'}`

    scores.push({ symbol: pair, score, direction, strength, factors, reason })
    console.log(`[Scorer] ${pair}: score=${score} ${strength}`)
  }

  state.signals = scores
  return scores
}
