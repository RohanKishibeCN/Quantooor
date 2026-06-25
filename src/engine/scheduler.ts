import type { SystemState } from '../core/types.js'
import type { NotionReporter } from '../notion/reporter.js'

export class Scheduler {
  private state: SystemState
  private reporter: NotionReporter
  private interval: NodeJS.Timeout | null = null

  constructor(state: SystemState, reporter: NotionReporter) {
    this.state = state
    this.reporter = reporter
  }

  start(reportHour: number, reportMinute: number): void {
    this.interval = setInterval(() => {
      const now = new Date()
      const hour = now.getHours()
      const minute = now.getMinutes()

      if (hour === reportHour && minute === reportMinute && now.getTime() - this.state.lastReportTime > 60000) {
        this.state.lastReportTime = now.getTime()
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
