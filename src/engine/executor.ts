import type { RuntimeConfig, SystemState, TradeOrder, TradeRecord } from '../core/types.js'
import { OrderSide, PositionSide } from '../core/types.js'
import type { IExchange } from '../core/types.js'

let tradeIdCounter = 0

export enum ExecMode {
  SIGNAL_ONLY = 'signal_only',
  DRY_RUN = 'dry_run',
  SEMI_AUTO = 'semi_auto',
  FULL_AUTO = 'full_auto',
}

export function getExecMode(config: RuntimeConfig): ExecMode {
  if (!config.exchangeEnabled) return ExecMode.SIGNAL_ONLY
  if (config.dryRun) return ExecMode.DRY_RUN
  if (config.autoTradeEnabled) return ExecMode.FULL_AUTO
  return ExecMode.SEMI_AUTO
}

export async function executeTradeOrders(
  config: RuntimeConfig,
  state: SystemState,
  exchange: IExchange | null,
  orders: TradeOrder[]
): Promise<void> {
  if (!exchange) {
    console.log(`[Executor] No exchange, ${orders.length} order(s) skipped (signal only)`)
    return
  }

  const mode = getExecMode(config)
  if (mode === ExecMode.DRY_RUN || mode === ExecMode.SEMI_AUTO) {
    console.log(`[Executor] Mode=${mode}, ${orders.length} order(s) logged but not executed:`)
    for (const o of orders) {
      console.log(`  → ${o.symbol} ${o.side.toUpperCase()} ${o.amount} @${o.price} [${o.reason}]`)
    }
    return
  }

  if (mode === ExecMode.FULL_AUTO) {
    for (const o of orders) {
      if (o.confidence < config.minSignalConfidence) continue
      try {
        const orderId = await exchange.placeLimitOrder(o.symbol, o.side, o.amount, o.price, false, true)
        if (orderId) {
          const record: TradeRecord = {
            id: `T${++tradeIdCounter}`,
            symbol: o.symbol,
            side: o.side,
            positionSide: o.positionSide,
            amount: o.amount,
            entryPrice: o.price,
            entryTime: Date.now(),
            status: 'open',
            reason: o.reason,
          }
          state.openOrders.push(record)
          console.log(`[Executor] EXECUTED ${o.side.toUpperCase()} ${o.symbol}: ${o.amount} @${o.price}`)
        }
      } catch (err) {
        console.error(`[Executor] Failed ${o.symbol} ${o.side}:`, err)
      }
    }
  }
}
