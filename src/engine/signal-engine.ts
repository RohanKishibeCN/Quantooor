import type { RuntimeConfig, SystemState, TradeOrder, ScoreResult } from '../core/types.js'
import { OrderSide, PositionSide } from '../core/types.js'
import type { IExchange } from '../core/types.js'
import { TrueNorthClient } from '../truenorth/client.js'
import { runScorer } from '../strategies/scorer.js'
import { runAnomalyScan } from '../strategies/anomaly.js'
import { runFundingWatch } from '../strategies/funding-watch.js'
import { executeTradeOrders, getExecMode, ExecMode } from './executor.js'

export class SignalEngine {
  private config: RuntimeConfig
  private state: SystemState
  private tn: TrueNorthClient
  private exchange: IExchange | null

  constructor(config: RuntimeConfig, state: SystemState, tn: TrueNorthClient, exchange: IExchange | null) {
    this.config = config
    this.state = state
    this.tn = tn
    this.exchange = exchange
  }

  async tick(): Promise<void> {
    if (this.state.isPaused) return

    const tnSnapshot = await this.tn.fetchMarketSnapshot()
    this.state.lastTnAnalysis = tnSnapshot
    this.state.lastTnAnalysisTime = Date.now()

    const scores = await runScorer(this.config, this.state, this.tn)
    await runAnomalyScan(this.config, this.state, tnSnapshot, this.exchange, this.tn)
    await runFundingWatch(this.config, this.state, tnSnapshot, this.exchange)

    if (scores.length > 0) {
      const mode = getExecMode(this.config)
      if (mode === ExecMode.FULL_AUTO || mode === ExecMode.SEMI_AUTO) {
        const orders = this.signalsToOrders(scores)
        if (orders.length > 0) {
          await executeTradeOrders(this.config, this.state, this.exchange, orders)
        }
      }
    }
  }

  private signalsToOrders(scores: ScoreResult[]): TradeOrder[] {
    const orders: TradeOrder[] = []
    for (const s of scores) {
      if (s.direction === 'neutral') continue
      const side = s.direction === 'buy' ? OrderSide.BUY : OrderSide.SELL
      const posSide = s.direction === 'buy' ? PositionSide.LONG : PositionSide.SHORT
      const tokenData = this.state.lastTnAnalysis?.perToken.get(s.symbol)
      const price = tokenData?.price ?? 0
      if (price <= 0) continue
      const amount = (this.config.totalCapitalUsdt * (this.config.maxPositionPct / 100)) / price
      orders.push({
        symbol: s.symbol,
        side,
        positionSide: posSide,
        amount: Math.floor(amount * 1000) / 1000,
        price,
        type: 'limit',
        reduceOnly: false,
        reason: s.reason,
        confidence: Math.abs(s.score) + 40,
        timestamp: Date.now(),
      })
    }
    return orders
  }
}
