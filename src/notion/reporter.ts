import type { RuntimeConfig, SystemState, DailyReport } from '../core/types.js'

export class NotionReporter {
  private config: RuntimeConfig
  private state: SystemState

  constructor(config: RuntimeConfig, state: SystemState) {
    this.config = config
    this.state = state
  }

  async sendDailyReport(): Promise<void> {
    const analysis = this.state.lastTnAnalysis
    if (!analysis) {
      console.log('[Notion] No analysis data yet, skipping report')
      return
    }

    const now = new Date()
    const tz = this.config.runtimeTimezone

    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
    const weekdayFull = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, weekday: 'long' }).format(now)
    const weekdayMap: Record<string, string> = { '星期一': '周一', '星期二': '周二', '星期三': '周三', '星期四': '周四', '星期五': '周五', '星期六': '周六', '星期日': '周日', '星期天': '周日' }
    const weekday = weekdayMap[weekdayFull] ?? ''
    const today = dateStr.slice(5).replace('-','/')

    const signals = this.state.signals
    const anomalies = this.state.anomalies
    const fundings = this.state.fundingSnapshots

    const content = this.buildContent(analysis, signals, anomalies, fundings)

    const title = `📊 日报 ${today} (${weekday})`

    console.log(`[Notion] Preparing report: title="${title}" db=${this.config.notionDatabaseId.slice(0,8)}... signalCount=${signals.length}`)

    try {
      const props: Record<string, unknown> = {}
      props[this.config.notionTitleProp] = { title: [{ text: { content: title } }] }
      props[this.config.notionDateProp] = { date: { start: dateStr } }
      props[this.config.notionContentProp] = { rich_text: [{ type: 'text', text: { content } }] }

      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.notionApiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: this.config.notionDatabaseId },
          properties: props,
        }),
      })

      const resText = await res.text()

      if (!res.ok) {
        console.error(`[Notion] API ${res.status}: ${resText.slice(0, 400)}`)
        return
      }

      console.log(`[Notion] ✅ Report sent: ${title}`)
    } catch (err) {
      console.error('[Notion] Failed to send report:', err)
    }
  }

  private buildContent(
    analysis: NonNullable<SystemState['lastTnAnalysis']>,
    signals: DailyReport['signals'],
    anomalies: DailyReport['anomalies'],
    fundings: DailyReport['fundingSnapshots'],
  ): string {
    const lines: string[] = []

    lines.push('🌡️ 市场环境')
    lines.push(`状态: ${analysis.regime} | 情绪: ${analysis.sentiment}`)
    lines.push(`风险: ${analysis.riskLevel} — ${analysis.riskReason}`)
    lines.push(`板块轮动: ${analysis.marketScan.sectorRotation.join(' > ') || '无数据'}`)
    lines.push('')

    lines.push('🎯 今日信号')
    if (signals.length === 0) {
      lines.push('暂无评分数据')
    } else {
      for (const s of signals) {
        const emoji = s.direction === 'buy' ? (s.strength === 'strong_buy' ? '🟢' : '🟡') : s.direction === 'sell' ? (s.strength === 'strong_sell' ? '🔴' : '🟠') : '⚪'
        const f = s.factors
        const factorStr = Object.values(f).length > 0
          ? ` [RSI:${f['rsi']?.toFixed(1) ?? '-'} EMA:${f['ema']?.toFixed(1) ?? '-'}]`
          : ''
        lines.push(`${emoji} ${s.symbol}: 评分 ${s.score.toFixed(1)} | ${s.strength}${factorStr}`)
      }
    }
    lines.push('')

    lines.push('🚨 市场异动')
    if (anomalies.length === 0) {
      lines.push('无显著异动')
    } else {
      for (const a of anomalies) {
        const icon = a.type === 'price' ? '📈' : a.type === 'funding' ? '💸' : '🔥'
        lines.push(`${icon} ${a.symbol}: ${a.detail}`)
      }
    }
    lines.push('')

    lines.push('💰 资金费率')
    if (fundings.length === 0) {
      lines.push('暂无费率数据')
    } else {
      for (const f of fundings) {
        const emoji = f.level === 'high' || f.level === 'low' ? '⚠️' : '✅'
        lines.push(`${emoji} ${f.symbol}: ${f.rate.toFixed(3)}% → ${f.label}`)
      }
    }
    lines.push('')

    lines.push('📈 因子明细')
    if (signals.length === 0 || !signals[0].factors) {
      lines.push('暂无因子数据')
    } else {
      for (const s of signals) {
        const f = s.factors
        lines.push(`  ${s.symbol}: RSI=${f['rsi']?.toFixed(1) ?? '-'} EMA=${f['ema']?.toFixed(1) ?? '-'} 趋势=${f['trend']?.toFixed(1) ?? '-'} 情绪=${f['sentiment']?.toFixed(1) ?? '-'} 费率=${f['funding']?.toFixed(1) ?? '-'} 风险=${f['risk']?.toFixed(1) ?? '-'}`)
      }
    }

    return lines.join('\n')
  }
}
