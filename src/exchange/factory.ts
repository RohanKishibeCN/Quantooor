import type { IExchange } from '../core/types.js'
import { BinanceExchange } from './binance.js'
import { OKXExchange } from './okx.js'
import type { RuntimeConfig } from '../core/types.js'

export async function createExchange(config: RuntimeConfig): Promise<IExchange | null> {
  if (!config.exchangeEnabled) return null

  let exchange: IExchange
  if (config.exchangeProvider === 'okx') {
    exchange = new OKXExchange(config)
  } else {
    exchange = new BinanceExchange(config)
  }
  await exchange.init()
  return exchange
}
