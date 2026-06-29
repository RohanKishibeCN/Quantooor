import type { SystemState, RuntimeConfig } from '../core/types.js'
import type { NotionReporter } from '../notion/reporter.js'

export class Scheduler {
  private state: SystemState
  private reporter: NotionReporter
  private config: RuntimeConfig
  private interval: NodeJS.Timeout | null = null

  constructor(config: RuntimeConfig, state: SystemState, reporter: NotionReporter) {
    this.config = config
    this.state = state
    this.reporter = reporter
  }

  start(): void {
    const tz = this.config.runtimeTimezone
    const targetHour = this.config.notionReportHour
    const targetMinute = this.config.notionReportMinute

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })

    console.log(`[Scheduler] Report target: ${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')} ${tz}`)
    console.log(`[Scheduler] Current time (${tz}): ${fmt.format(new Date())}`)

    this.interval = setInterval(() => {
      const parts = fmt.formatToParts(new Date())
      const hour = Number(parts.find(p => p.type === 'hour')?.value ?? -1)
      const minute = Number(parts.find(p => p.type === 'minute')?.value ?? -1)

      if (hour === targetHour && minute === targetMinute && Date.now() - this.state.lastReportTime > 60000) {
        this.state.lastReportTime = Date.now()
        console.log('[Scheduler] Triggering daily report...')
        this.reporter.sendDailyReport().catch(err => {
          console.error('[Scheduler] Report failed:', err)
        })
      }
    }, 30000)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
}
