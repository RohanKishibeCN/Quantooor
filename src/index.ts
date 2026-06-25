import { loadConfig } from './config/index.js'
import type { SystemState } from './core/types.js'
import { TrueNorthClient } from './truenorth/client.js'
import { createExchange } from './exchange/factory.js'
import { SignalEngine } from './engine/signal-engine.js'
import { Scheduler } from './engine/scheduler.js'
import { NotionReporter } from './notion/reporter.js'
import { ExecMode, getExecMode } from './engine/executor.js'

const CYCLE_INTERVAL_MS = 10000

async function main(): Promise<void> {
  console.log(`
  ╔══════════════════════════════════╗
  ║   Trueno Quant MVP v1.0          ║
  ║   TrueNorth · OKX/Binance · Notion║
  ╚══════════════════════════════════╝
  `)

  const config = loadConfig()
  const mode = getExecMode(config)

  const state: SystemState = {
    startTime: Date.now(),
    lastReportTime: 0,
    lastSignalTime: 0,
    lastAnomalyTime: 0,
    lastFundingTime: 0,
    signals: [],
    anomalies: [],
    fundingSnapshots: [],
    lastTnAnalysis: null,
    lastTnAnalysisTime: 0,
    openOrders: [],
    tradeHistory: [],
    dailyPnl: 0,
    totalPnl: 0,
    isPaused: false,
    pauseReason: '',
  }

  const tn = new TrueNorthClient(config)
  const exchange = await createExchange(config)

  const engine = new SignalEngine(config, state, tn, exchange)
  const reporter = new NotionReporter(config, state)
  const scheduler = new Scheduler(state, reporter)

  console.log(`[System] Mode: ${mode}`)
  console.log(`[System] Exchange: ${config.exchangeEnabled ? config.exchangeProvider : 'disabled (TrueNorth only)'}`)
  console.log(`[System] Pairs: ${config.tradingPairs.join(', ')}`)
  console.log(`[System] Signal interval: ${config.signalScanIntervalMs / 60000}min | Report: ${config.notionReportHour}:${String(config.notionReportMinute).padStart(2, '0')}`)

  scheduler.start(config.notionReportHour, config.notionReportMinute)

  const shutdown = () => {
    console.log('[System] Shutting down...')
    scheduler.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  while (true) {
    try {
      await engine.tick()
    } catch (err) {
      console.error('[System] Tick error:', err)
    }
    await sleep(CYCLE_INTERVAL_MS)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

main().catch(err => {
  console.error('[Fatal]', err)
  process.exit(1)
})
