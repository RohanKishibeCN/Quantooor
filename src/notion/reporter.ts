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

    const today = new Intl.DateTimeFormat('zh-CN', { timeZone: this.config.runtimeTimezone }).format(new Date())
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date().getDay()]

    const signals = this.state.signals
    const anomalies = this.state.anomalies
    const fundings = this.state.fundingSnapshots

    const blocks: Array<Record<string, unknown>> = [
      this.heading1('🌡️ 市场环境'),
      this.paragraph(`📊 状态: ${analysis.regime} | 情绪: ${analysis.sentiment}`),
      this.paragraph(`⚠️ 风险: ${analysis.riskLevel} | ${analysis.riskReason}`),
      this.paragraph(`🔄 板块: ${analysis.marketScan.sectorRotation.join(' > ') || '无数据'}`),
      this.divider(),
      this.heading1('🎯 今日信号'),
      ...this.buildSignalBlocks(signals),
      this.divider(),
      this.heading1('🚨 市场异动'),
      ...(anomalies.length > 0
        ? anomalies.map(a => this.paragraph(`${a.type === 'price' ? '📈' : a.type === 'funding' ? '💸' : '🔥'} ${a.symbol}: ${a.detail}`))
        : [this.paragraph('无显著异动')]),
      this.divider(),
      this.heading1('💰 资金费率'),
      ...this.buildFundingBlocks(fundings),
      this.divider(),
      this.heading1('📈 因子明细'),
      ...this.buildFactorBlocks(signals),
    ]

    const title = `📊 日报 ${today} (${weekday})`

    try {
      const res = await fetch(`https://api.notion.com/v1/pages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.notionApiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: this.config.notionDatabaseId },
          properties: {
            '名称': { title: [{ text: { content: title } }] },
            '日期': { date: { start: today.replace(/\//g, '-') } },
          },
          children: blocks,
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Notion API error ${res.status}: ${body}`)
      }

      console.log(`[Notion] Report sent: ${title}`)
    } catch (err) {
      console.error('[Notion] Failed to send report:', err)
    }
  }

  private buildSignalBlocks(signals: DailyReport['signals']): Array<Record<string, unknown>> {
    if (signals.length === 0) return [this.paragraph('暂无评分数据')]
    const rows = signals.map(s => {
      const emoji = s.direction === 'buy' ? (s.strength === 'strong_buy' ? '🟢' : '🟡') : s.direction === 'sell' ? (s.strength === 'strong_sell' ? '🔴' : '🟠') : '⚪'
      return this.paragraph(`${emoji} ${s.symbol}: 评分 ${s.score} | ${s.strength}`)
    })
    return rows
  }

  private buildFundingBlocks(fundings: DailyReport['fundingSnapshots']): Array<Record<string, unknown>> {
    if (fundings.length === 0) return [this.paragraph('暂无费率数据')]
    return fundings.map(f => {
      const emoji = f.level === 'high' || f.level === 'low' ? '⚠️' : '✅'
      return this.paragraph(`${emoji} ${f.symbol}: ${f.rate.toFixed(3)}% → ${f.label}`)
    })
  }

  private buildFactorBlocks(signals: DailyReport['signals']): Array<Record<string, unknown>> {
    if (signals.length === 0 || !signals[0].factors) return [this.paragraph('暂无因子数据')]
    const header = this.paragraph(`| 币种 | RSI | EMA | 趋势 | 情绪 | 费率 | 风险 | 总分 |`)
    const rows = signals.map(s => {
      const f = s.factors
      return this.paragraph(`| ${s.symbol} | ${f['rsi']?.toFixed(1) ?? '-'} | ${f['ema']?.toFixed(1) ?? '-'} | ${f['trend']?.toFixed(1) ?? '-'} | ${f['sentiment']?.toFixed(1) ?? '-'} | ${f['funding']?.toFixed(1) ?? '-'} | ${f['risk']?.toFixed(1) ?? '-'} | ${s.score} |`)
    })
    return [header, ...rows]
  }

  private heading1(text: string): Record<string, unknown> {
    return {
      object: 'block',
      type: 'heading_1',
      heading_1: { rich_text: [{ type: 'text', text: { content: text } }] },
    }
  }

  private paragraph(text: string): Record<string, unknown> {
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: text } }] },
    }
  }

  private divider(): Record<string, unknown> {
    return { object: 'block', type: 'divider', divider: {} }
  }
}
