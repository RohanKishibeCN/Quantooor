import type { SystemState, RuntimeConfig } from '../core/types.js'
import type { NotionReporter } from '../notion/reporter.js'

export class Scheduler {
  private state: SystemState
  private reporter: NotionReporter
  private config: RuntimeConfig
  private interval: NodeJS.Timeout | null = null
  private tickCount = 0

  constructor(config: RuntimeConfig, state: SystemState, reporter: NotionReporter) {
    this.config = config
    this.state = state
    this.reporter = reporter
  }

  start(): void {
    const tz = this.config.runtimeTimezone
    const targetHour = this.config.notionReportHour
    const targetMinute = this.config.notionReportMinute

    console.log(`[Scheduler] Started — target: ${String(targetHour).padStart(2,'0')}:${String(targetMinute).padStart(2,'0')} ${tz}`)

    this.interval = setInterval(() => {
      this.tickCount++

      const now = new Date()

      const tzHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now))
      const tzMinute = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, minute: 'numeric' }).format(now))
      const tzMinuteStr = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })

      if (this.tickCount <= 3) {
        console.log(`[Scheduler] tick#${this.tickCount} tz=${tz} now=${tzMinuteStr} hour=${tzHour} minute=${tzMinute}`)
      }

      const sinceLast = Date.now() - this.state.lastReportTime

      if (tzHour === targetHour && tzMinute === targetMinute && sinceLast > 60000) {
        this.state.lastReportTime = Date.now()
        console.log(`[Scheduler] === TRIGGER === ${tzMinuteStr} (since last: ${sinceLast}ms)`)
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
