# Trueno Quant MVP 策略与技术方案

> 基于 TrueNorth 的量化信号系统 · 低复杂度 · 快速验证  
> 版本：MVP v1.0 | 更新时间：2026-06-25

---

## 目录

- [1. MVP 定位](#1-mvp-%E5%AE%9A%E4%BD%8D)
- [2. 数据源设计](#2-%E6%95%B0%E6%8D%AE%E6%BA%90%E8%AE%BE%E8%AE%A1)
- [3. 策略详解](#3-%E7%AD%96%E7%95%A5%E8%AF%A6%E8%A7%A3)
  - [3.1 策略一：多因子评分信号（主力）](#31-%E7%AD%96%E7%95%A5%E4%B8%80%E5%A4%9A%E5%9B%A0%E5%AD%90%E8%AF%84%E5%88%86%E4%BF%A1%E5%8F%B7%E4%B8%BB%E5%8A%9B)
  - [3.2 策略二：市场异动监测（辅助）](#32-%E7%AD%96%E7%95%A5%E4%BA%8C%E5%B8%82%E5%9C%BA%E5%BC%82%E5%8A%A8%E7%9B%91%E6%B5%8B%E8%BE%85%E5%8A%A9)
  - [3.3 策略三：资金费率观察（辅助）](#33-%E7%AD%96%E7%95%A5%E4%B8%89%E8%B5%84%E9%87%91%E8%B4%B9%E7%8E%87%E8%A7%82%E5%AF%9F%E8%BE%85%E5%8A%A9)
- [4. Notion 日报](#4-notion-%E6%97%A5%E6%8A%A5)
- [5. 系统架构](#5-%E7%B3%BB%E7%BB%9F%E6%9E%B6%E6%9E%84)
- [6. 配置设计](#6-%E9%85%8D%E7%BD%AE%E8%AE%BE%E8%AE%A1)
- [7. 运行与部署](#7-%E8%BF%90%E8%A1%8C%E4%B8%8E%E9%83%A8%E7%BD%B2)
- [8. 风险与局限](#8-%E9%A3%8E%E9%99%A9%E4%B8%8E%E5%B1%80%E9%99%90)
- [A. 补充说明](#a-%E8%A1%A5%E5%85%85%E8%AF%B4%E6%98%8E)

---

## 1. MVP 定位

### 1.1 目标

```
不是生产级交易系统，是验证想法的信号引擎。
只做信号、不自动下单、每日推送到 Notion。
```

### 1.2 MVP 包含 / 不包含

| 包含 | 不包含（后续迭代） |
|---|---|
| 多因子评分 + 信号输出 | 自动下单执行 |
| 市场异动检测 | 资金费率套利开仓 |
| 资金费率观察 | 止损/止盈管理 |
| 每日 Notion 日报 | 前端页面 |
| 本地技术指标计算 | 多交易对并行走K线 |
| 干跑模式（默认） | PM2 托管 |
| TrueNorth 数据优先 | 链上数据 |

### 1.3 设计原则

1. **简单有效** — 策略对标 JN-VC，一个主策略 + 两个辅助扫描
2. **数据分层** — TrueNorth 为主，币安可选，本地兜底
3. **纯 env 配置** — 所有参数可调，零硬编码
4. **先看后做** — 先跑信号，确认可靠再接入下单

---

## 2. 数据源设计

### 2.1 数据来源分层

```
┌─────────────────────────────────────────────┐
│              数据源优先级                      │
│                                               │
│  Layer 1 (主)   TrueNorth / Claude API        │
│  ├─ 实时价格、技术指标、市场情绪              │
│  ├─ 衍生品数据（资金费率、OI）                │
│  ├─ Market Scan（热门代币、板块轮动）         │
│  └─ 新闻催化剂                                │
│                                               │
│  Layer 2 (备)   交易所 CCXT                   │
│  ├─ 启用开关: EXCHANGE_ENABLED                │
│  ├─ 选择交易所: EXCHANGE_PROVIDER=binance|okx  │
│  ├─ K线 / Ticker / 资金费率                   │
│  └─ 策略切换: 可热替换数据源                  │
│                                               │
│  Layer 3 (兜底) 本地技术指标                  │
│  └─ 纯 TS 实现 RSI/EMA/MACD/BB（无外部依赖）  │
│                                               │
└─────────────────────────────────────────────┘
```

### 2.2 TrueNorth 数据获取方式

通过 Claude API 间接调用 TrueNorth MCP。系统构造 Prompt 注入当前场景，Claude 调用 MCP 工具，返回结构化 JSON。

```
系统 → Claude API → TrueNorth MCP → 实时数据
                          ↓
                   Claude 返回 JSON
                          ↓
                   解析后进入策略
```

**限制与应对**：

| 限制 | 应对 |
|---|---|
| TrueNorth 无独立 API | 通过 Claude API 中转 |
| Claude 有 rate limit | 缓存分析结果，避免频繁调用 |
| 输出是自然语言 | Prompt 要求严格 JSON 格式 |
| TrueNorth 将来可能收费 | 本地技术指标可替换 80% 功能 |

### 2.3 交易所接口（保留但默认关闭）

```
原因: 币安接口被封，OKX 作为备选通道。

方案:
- EXCHANGE_ENABLED=false  → 只用 TrueNorth + 本地指标
- EXCHANGE_ENABLED=true   → 启用 CCXT 连接指定交易所
- EXCHANGE_PROVIDER=okx   → 连接 OKX（推荐，国内 IP 通常可用）
- EXCHANGE_PROVIDER=binance → 连接币安（解封后可直接切换）

交易所之间切换只需改一个 env 变量，
代码通过工厂模式根据 EXCHANGE_PROVIDER 自动创建对应实例。
```

交易所数据覆盖的能力（启用后）：

| 数据项 | 用途 |
|---|---|
| K 线 (15m/1H/4H/1D) | 技术指标计算的独立数据源 |
| 资金费率 | 替代/交叉验证 TrueNorth 的费率数据 |
| 持仓信息 | 实盘交易时需要账户仓位 |
| 下单执行 | 实盘模式时通过 CCXT 统一接口下单 |

### 2.4 执行层设计（实盘交易）

#### 2.4.1 三级开关

实盘交易由三个 env 变量联合控制，层层加锁：

```
┌─ L1: EXCHANGE_ENABLED=true       ← 交易所连接开关
│        ↓ 必须为 true 才能进入 L2
├─ L2: DRY_RUN=false              ← 干跑/实盘模式
│        ↓ 必须为 false 才能进入 L3
├─ L3: AUTO_TRADE_ENABLED=true    ← 自动交易开关
│        ↓ 必须为 true 才自动下单
└─ 结果: 三个全通过 = 实盘自动交易
```

| 组合 | EXCHANGE_ENABLED | DRY_RUN | AUTO_TRADE_ENABLED | 行为 |
|---|---|---|---|---|
| A | false | * | * | 纯信号模式，不连交易所 |
| B | true | true | * | 连接交易所获取数据，信号记录但不发单 |
| C | true | false | false | 实盘模式但半自动：输出信号，人工确认后手动执行 |
| D | true | false | **true** | **全自动实盘**：信号直接下单 |

> 推荐路线: A (MVP 启动) → B (验证数据) → C (验证信号) → D (全自动)

#### 4.2.2 订单类型

| 订单类型 | 使用场景 | 参数 |
|---|---|---|
| **限价单 (Post-Only)** | 入场建仓 | 挂单吃 maker 返佣，不付 taker 费 |
| **市价单** | 紧急平仓/止损 | 立即成交，接受滑点 |
| **限价止盈** | 目标价离场 | 挂止盈限价单 |
| **止损市价** | 风控离场 | 触发价 + 市价成交 |

#### 4.2.3 风控约束

```
实盘模式下额外强制约束:
┌─ 单笔最大仓位: 总资金的 MAX_POSITION_PCT（默认 20%）
├─ 最大同时持仓数: MAX_CONCURRENT_POSITIONS（默认 3）
├─ 单日最大亏损: MAX_DAILY_LOSS_PCT（默认 2%）
├─ 最低信号置信度: MIN_SIGNAL_CONFIDENCE（默认 60）
└─ 触发任一 → 暂停新开仓，仅允许平仓
```

---

## 3. 策略详解

### 3.1 策略一：多因子评分信号（主力）

**参考来源**：JN-VC 的 AI 策略信号系统

#### 3.1.1 原理

从多个维度给监控的资产打分，综合评分超过阈值就发出信号。每个维度都有经济学解释，不纯靠数据拟合。

#### 3.1.2 评分模型

| 因子 | 权重 | 数据来源 | 打分规则 |
|---|---|---|---|
| **RSI 位置** | 25% | 本地计算 | 40-60: +15 / 30-40: +5 / <30: -15 |
| **均线排列** | 20% | 本地计算 | EMA9 > EMA21: +10 / EMA9 < EMA21: -10 |
| **市场趋势** | 15% | TrueNorth | trending_up: +10 / ranging: +5 / trending_down: -10 |
| **市场情绪** | 20% | TrueNorth | bullish: +10 / neutral: +5 / bearish: -10 |
| **资金费环境** | 10% | TrueNorth | 费率正常(±0.01): +10 / 中等(±0.05): +5 / 极端: -10 |
| **风险等级** | 10% | TrueNorth | low: +10 / medium: 0 / high: -10 |

**总分范围**: -65 到 +65

```
信号阈值:
┌─ Score > +30 → 🟢 强买入信号（买入或持有）
├─ Score +10 ~ +30 → 🟡 中性偏多（观察）
├─ Score -10 ~ +10 → ⚪ 无信号
├─ Score -30 ~ -10 → 🟠 中性偏空（减仓）
└─ Score < -30 → 🔴 强卖出信号（卖出或保持空仓）
```

#### 3.1.3 实现流程

```
每 30 分钟一次:

1. 从 TrueNorth 获取全市场快照
   └─ prompt: "Analyze BTC, ETH, SOL, BNB - regime, sentiment, funding, risk"
   └─ 返回 JSON: { btc: {...}, eth: {...}, ... }

2. 计算本地技术指标
   └─ 用从 TrueNorth 获取的 OHLC 数据 (或缓存价格)
   └─ 计算 RSI(14), EMA(9/21), 布林带(20)

3. 对每个资产打分
   └─ 6 因子加权 = 各因子得分 × 权重，求和

4. 生成信号
   └─ 过阈值 → 输出信号
   └─ 不足 → 记录日志但不出信号

5. 信号存储
   └─ 写入内存 signals[]
   └─ 日报用（每天早 9 点汇总）
```

#### 3.1.4 参数配置

```
# 策略参数
SIGNAL_SCAN_INTERVAL_MS=1800000       # 30分钟
SIGNAL_BUY_THRESHOLD=30               # 买入阈值
SIGNAL_SELL_THRESHOLD=-30             # 卖出阈值
SIGNAL_STRONG_BUY_THRESHOLD=45        # 强买入阈值
SIGNAL_STRONG_SELL_THRESHOLD=-45      # 强卖出阈值

# 因子权重（总和必须 = 100）
SIGNAL_W_RSI=25
SIGNAL_W_EMA=20
SIGNAL_W_TREND=15
SIGNAL_W_SENTIMENT=20
SIGNAL_W_FUNDING=10
SIGNAL_W_RISK=10
```

---

### 3.2 策略二：市场异动监测（辅助）

**参考来源**：JN-VC 的 Radar 妖币监控系统

#### 3.2.1 原理

利用 TrueNorth 的市场发现能力，检测市场中的异常信号。不自动交易，只在日报中展示。

#### 3.2.2 检测项目

```
检测清单:
┌─ 价格异动 ───────────────────────────────┐
│  - 24h 涨跌幅超过 ±8% 的币种               │
│  - 4H 内涨跌幅超过 ±5% 的币种              │
└───────────────────────────────────────────┘

┌─ 资金异动 ───────────────────────────────┐
│  - 资金费率超过 ±0.1%（极端偏离）          │
│  - OI 变化超过 ±20%（大量开/平仓）         │
└───────────────────────────────────────────┘

┌─ 热度异动 ───────────────────────────────┐
│  - Market Scan 中出现的新热门币种          │
│  - 板块资金流入/流出判断                   │
└───────────────────────────────────────────┘
```

#### 3.2.3 输入 / 输出

```
输入:
- TrueNorth Market Scan 结果
- TrueNorth Token Analysis (各币种)
- 各币种 24h 变化数据

输出:
- 当日日报中 "市场异动" 板块
- 列出满足任一检测条件的币种 + 原因
```

#### 3.2.4 参数配置

```
ANOMALY_PRICE_CHANGE_PCT=8           # 价格异动阈值(%)
ANOMALY_FUNDING_RATE_PCT=0.1         # 资金费率异动阈值(%)
ANOMALY_OI_CHANGE_PCT=20             # OI异动阈值(%)
ANOMALY_SCAN_INTERVAL_MS=1800000     # 30分钟
```

---

### 3.3 策略三：资金费率观察（辅助）

**参考来源**：JN-VC 的量化信号 + 原始方案中的套利思路

#### 3.3.1 原理

不自动交易，但在日报中标注当前资金费率环境，辅助决策。

```
标记规则:
┌─ 费率 > 0.05% → ⚠️ 市场过热，空头有利 → 日报标注
├─ 费率 < -0.05% → ⚠️ 市场恐慌，多头有利 → 日报标注
├─ 费率 0.01~0.05% → ✅ 正常偏多
└─ 费率 -0.05~-0.01% → ✅ 正常偏空
```

#### 3.3.2 参数配置

```
FUNDING_HIGH_THRESHOLD=0.05          # 高费率阈值(%)
FUNDING_LOW_THRESHOLD=-0.05          # 低费率阈值(%)
FUNDING_SCAN_INTERVAL_MS=600000      # 10分钟（费率8小时才变一次）
```

---

## 4. Notion 日报

### 4.1 推送时机

每天 **09:00** (Asia/Shanghai) 自动生成并推送到 Notion。

### 4.2 日报模板

```
┌──────────────────────────────────────────────────┐
│  📊 Trueno Quant 日报                             │
│  2026-06-25 (周三)                                │
├──────────────────────────────────────────────────┤
│                                                    │
│  🌡️ 市场环境                                      │
│  ┌──────────────────────────────────────────────┐ │
│  │ 状态: 震荡偏多 | 情绪: neutral               │ │
│  │ 风险: medium | 原因: 资金费率正常，无明显风险  │ │
│  │ 板块: DeFi 流入 > L1 流出                     │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  🎯 今日信号                                      │
│  ┌──────────┬──────┬──────┬────────┬────────────┐ │
│  │ 币种     │ 评分  │ 方向  │ 强度   │ 关键理由    │ │
│  ├──────────┼──────┼──────┼────────┼────────────┤ │
│  │ BTCUSDT  │ +42  │ 🟢多  │ 强买入 │ RSI健康+趋势 │ │
│  │ ETHUSDT  │ +32  │ 🟢多  │ 买入    │ 费率中性+EMA │ │
│  │ SOLUSDT  │ -15  │ 🟠空  │ 观望   │ 情绪偏弱     │ │
│  │ BNBUSDT  │  +8  │ ⚪    │ 无信号 │ 无明确方向   │ │
│  └──────────┴──────┴──────┴────────┴────────────┘ │
│                                                    │
│  🚨 市场异动                                      │
│  ┌──────────────────────────────────────────────┐ │
│  │ DOGEUSDT 24h +12.5% → 价格异动               │ │
│  │ SHIBUSDT 资金费率 0.12% → 费率极端           │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  💰 资金费率快照                                   │
│  ┌──────────┬──────────┬──────────────────────┐  │
│  │ BTCUSDT  │  0.01%   │ ✅ 正常              │  │
│  │ ETHUSDT  │  0.02%   │ ✅ 正常              │  │
│  │ SOLUSDT  │ -0.03%   │ ✅ 正常偏空          │  │
│  │ BNBUSDT  │  0.01%   │ ✅ 正常              │  │
│  └──────────┴──────────┴──────────────────────┘  │
│                                                    │
│  📈 因子明细                                      │
│  ┌──────────┬─────┬─────┬────┬──────┬─────┬─────┐│
│  │          │RSI  │ EMA │趋势│ 情绪  │费率 │风险 ││
│  ├──────────┼─────┼─────┼────┼──────┼─────┼─────┤│
│  │ BTCUSDT  │ +15 │ +10 │ +5 │  +5  │ +5  │ +2  ││
│  │ ETHUSDT  │  +5 │ +10 │ +5 │  +5  │ +5  │ +2  ││
│  │ SOLUSDT  │ -10 │ -10 │ +5 │  -5  │ +5  │  0  ││
│  │ BNBUSDT  │  0  │  0  │ +5 │   0  │ +5  │ -2  ││
│  └──────────┴─────┴─────┴────┴──────┴─────┴─────┘│
│                                                    │
└────────────────────────────────────────────────────┘
```

### 4.3 Notion 集成方式

```typescript
// 使用 Notion API + @notionhq/client
// 需要 Notion Integration Token + Database ID

import { Client } from '@notionhq/client'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

await notion.pages.create({
  parent: { database_id: process.env.NOTION_DATABASE_ID },
  properties: {
    '日期': { date: { start: '2026-06-25' } },
    '名称': { title: [{ text: { content: `日报 2026-06-25` } }] },
  },
  children: [/* 日报 blocks */],
})
```

### 4.4 配置参数

```
NOTION_API_KEY=                       # Notion Integration Token
NOTION_DATABASE_ID=                   # 存放日报的 Database ID
NOTION_REPORT_HOUR=9                  # 日报推送时间（北京时间，小时）
NOTION_REPORT_MINUTE=0
```

---

## 5. 系统架构

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Trueno Quant MVP                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────────────────┐                  │
│  │ 入口      │───▶│  SignalEngine (轮询)  │                  │
│  │ index.ts │    │  10s tick, 选择性执行  │                  │
│  └──────────┘    └──────────┬───────────┘                  │
│                             │                               │
│        ┌────────────────────┼────────────────────┐         │
│        ▼                    ▼                    ▼         │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ 评分信号   │    │  异动监测    │    │  费率观察     │     │
│  │ (主力)    │    │  (辅助)      │    │  (辅助)       │     │
│  └────┬─────┘    └──────┬───────┘    └──────┬───────┘     │
│       │                 │                   │              │
│       └─────────────────┼───────────────────┘              │
│                         ▼                                  │
│  ┌──────────────────────────────────────────┐             │
│  │           TrueNorth 分析层                │             │
│  │  ├─ Claude API 调用 → MCP 工具           │             │
│  │  ├─ 本地技术指标 (RSI/EMA/MACD/BB)       │             │
│  │  └─ 结果缓存 (避免频繁调用)              │             │
│  └──────────────────────────────────────────┘             │
│                         │                                  │
│  ┌──────────────────────┴──────────────────────┐         │
│  │          数据源选择开关                      │         │
│  │  ┌─────────────┐    ┌──────────────────┐   │         │
│  │  │ TrueNorth    │    │ 交易所 (CCXT)     │   │         │
│  │  │ 默认启用     │    │  binance | okx     │   │         │
│  │  │              │    │  EXCHANGE_ENABLED  │   │         │
│  │  └─────────────┘    └──────────────────┘   │         │
│  └────────────────────────────────────────────┘         │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │           执行层 (可选)                   │          │
│  │  ├─ L1: EXCHANGE_ENABLED 连接交易所      │          │
│  │  ├─ L2: DRY_RUN=false    实盘模式        │          │
│  │  ├─ L3: AUTO_TRADE_ENABLED 自动下单      │          │
│  │  └─ 风控: 仓位/止损/日亏损上限           │          │
│  └──────────────────────────────────────────┘          │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │           输出层                          │          │
│  │  ├─ Notion 每日日报 (09:00)              │          │
│  │  ├─ 控制台日志 (结构化)                  │          │
│  │  └─ JSON 文件 (data/signals.json)        │          │
│  └──────────────────────────────────────────┘          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 5.2 模块职责

| 模块 | 文件 | 职责 |
|---|---|---|
| **入口** | `src/index.ts` | 组装模块、启停调度 |
| **配置** | `src/config/index.ts` | 全部 env → 类型化配置 |
| **类型** | `src/core/types.ts` | 核心接口/枚举 |
| **日志** | `src/core/logger.ts` | 结构化日志 + 文件轮转 |
| **信号引擎** | `src/engine/signal-engine.ts` | 轮询调度、信号聚合 |
| **评分策略** | `src/strategies/scorer.ts` | 多因子评分计算 |
| **异动策略** | `src/strategies/anomaly.ts` | 市场异动检测 |
| **费率策略** | `src/strategies/funding-watch.ts` | 资金费率观察 |
| **执行器** | `src/engine/executor.ts` | 三级开关检查 + 下单 + 风控 |
| **TrueNorth** | `src/truenorth/client.ts` | Claude API 封装 + 指标计算 |
| **币安** | `src/exchange/binance.ts` | CCXT 币安封装 |
| **OKX** | `src/exchange/okx.ts` | CCXT OKX 封装 |
| **交易所工厂** | `src/exchange/factory.ts` | 根据 EXCHANGE_PROVIDER 创建实例 |
| **Notion** | `src/notion/reporter.ts` | 日报生成 + Notion API |
| **调度器** | `src/engine/scheduler.ts` | 每日 09:00 触发日报 |

### 5.3 主循环

```
系统启动
  │
  ├─ 读 env 配置
  ├─ 初始化 TrueNorth 客户端
  ├─ (可选) 初始化交易所连接 (EXCHANGE_ENABLED=true)
  │   └─ factory.create(EXCHANGE_PROVIDER) → binance | okx
  │
  └─ 进入轮询循环 (每 10 秒一次 tick)

tick:
  ├─ 检查日报时间 (09:00? → 生成日报)
  │
  ├─ 评分信号: 距上次 > 30min? → 触发 TrueNorth 分析 + 评分
  ├─ 异动监测: 距上次 > 30min? → 触发异动扫描
  ├─ 费率观察: 距上次 > 10min? → 触发费率扫描
  │
  ├─ 信号执行: 如果 EXCHANGE_ENABLED && !DRY_RUN && AUTO_TRADE_ENABLED
  │   └─ 过三级开关 → Executor 执行信号下单
  │
  └─ sleep(10s) → 下一 tick
```

### 5.4 目录结构

```
Quantooor/
├── .env                        # 本地配置（不上传 git）
├── .env.example                # 配置模板
├── .gitignore
├── .nvmrc                      # v20.20.2
├── package.json
├── tsconfig.json
├── docs/
│   └── strategy-technical-plan.md
│
└── src/
    ├── index.ts                # 入口
    │
    ├── config/
    │   └── index.ts            # env 配置解析
    │
    ├── core/
    │   ├── types.ts            # 全部类型
    │   └── logger.ts           # 日志工具
    │
    ├── truenorth/
    │   └── client.ts           # Claude API + 指标计算
    │
    ├── exchange/               # 交易所（可选，默认禁用）
    │   ├── base.ts             # 交易所抽象接口
    │   ├── binance.ts          # CCXT 币安封装
    │   ├── okx.ts              # CCXT OKX 封装
    │   └── factory.ts          # 根据 EXCHANGE_PROVIDER 创建实例
    │
    ├── strategies/
    │   ├── scorer.ts           # 多因子评分
    │   ├── anomaly.ts          # 异动监测
    │   └── funding-watch.ts    # 费率观察
    │
    ├── engine/
    │   ├── signal-engine.ts    # 轮询调度器
    │   ├── executor.ts         # 信号执行器（三级开关+下单+风控）
    │   └── scheduler.ts        # 定时任务（日报触发）
    │
    └── notion/
        └── reporter.ts         # Notion 日报生成
```

---

## 6. 配置设计

### 6.1 .env 完整模板

```bash
# ==========================================
#   Trueno Quant MVP 配置
#   所有参数通过此文件配置，无硬编码
# ==========================================

# --- TrueNorth / Claude API (必需) ---
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-20250514

# --- 交易所 (可选，默认禁用) ---
EXCHANGE_ENABLED=false                   # true=启用, false=纯TrueNorth信号模式
EXCHANGE_PROVIDER=okx                    # binance | okx
EXCHANGE_API_KEY=
EXCHANGE_SECRET_KEY=
EXCHANGE_PASSWORD=                       # OKX 需要 password，币安不需要
EXCHANGE_TESTNET=true                    # true=测试网, false=主网

# --- 实盘交易 (需 EXCHANGE_ENABLED=true) ---
DRY_RUN=true                            # true=干跑(只记信号不发单)
                                        # false=可进入实盘模式
AUTO_TRADE_ENABLED=false                # true=信号自动下单
                                        # false=半自动(输出信号,人工确认)
MAX_POSITION_PCT=20                     # 单笔最大仓位(%)
MAX_CONCURRENT_POSITIONS=3              # 最大同时持仓数
MAX_DAILY_LOSS_PCT=2                    # 单日最大亏损(%)
MIN_SIGNAL_CONFIDENCE=60                # 最低信号置信度才执行
TRADE_MIN_NOTIONAL_USDT=10              # 最小下单金额(USDT)

# --- Notion 日报 (必需) ---
NOTION_API_KEY=
NOTION_DATABASE_ID=
NOTION_REPORT_HOUR=9
NOTION_REPORT_MINUTE=0

# --- 运行模式 ---
RUNTIME_TIMEZONE=Asia/Shanghai

# --- 监控交易对 ---
TRADING_PAIRS=BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT

# ==========================================
#   策略参数
# ==========================================

# --- 多因子评分 (Scorer) ---
SIGNAL_SCAN_INTERVAL_MS=1800000       # 30分钟
SIGNAL_BUY_THRESHOLD=30               # 买入信号阈值
SIGNAL_SELL_THRESHOLD=-30             # 卖出信号阈值

SIGNAL_W_RSI=25                       # RSI 权重
SIGNAL_W_EMA=20                       # 均线权重
SIGNAL_W_TREND=15                     # 趋势权重
SIGNAL_W_SENTIMENT=20                 # 情绪权重
SIGNAL_W_FUNDING=10                   # 费率权重
SIGNAL_W_RISK=10                      # 风险权重

# --- 异动监测 (Anomaly) ---
ANOMALY_SCAN_INTERVAL_MS=1800000      # 30分钟
ANOMALY_PRICE_CHANGE_PCT=8            # 24h价格异动(%)
ANOMALY_FUNDING_RATE_PCT=0.1          # 资金费率异动(%)
ANOMALY_OI_CHANGE_PCT=20              # OI异动(%)

# --- 费率观察 (Funding Watch) ---
FUNDING_SCAN_INTERVAL_MS=600000       # 10分钟
FUNDING_HIGH_THRESHOLD=0.05           # 高热费率(%)
FUNDING_LOW_THRESHOLD=-0.05           # 恐慌费率(%)

# --- TrueNorth 调用频率 ---
TN_CACHE_TTL_MS=1800000               # 分析缓存30分钟
TN_MAX_RETRIES=3                      # 失败重试次数
```

### 6.2 配置优先级

```
env 文件属性 > 策略代码默认值

所有策略参数都可以通过 .env 调整
代码中不设硬编码的业务参数
```

---

## 7. 运行与部署

### 7.1 首次启动

```bash
# 1. 确认 Node 版本
node --version  # 必须 >= 20.20.2
# 如不满足：nvm install 20.20.2 && nvm use 20.20.2

# 2. 安装依赖
npm install

# 3. 复制并编辑配置
cp .env.example .env
# 编辑 .env → 填入 CLAUDE_API_KEY + NOTION_API_KEY + NOTION_DATABASE_ID（如需启用交易所，还需填入 EXCHANGE_API_KEY 等）

# 4. 干跑模式启动（默认，安全）
npm run dev
```

### 7.2 VPS 部署

```bash
# ssh 到 VPS
# 克隆代码
git clone <repo> && cd Quantooor

# 确认 Node 版本 >= 20.20.2
nvm install 20.20.2
nvm use 20.20.2

# 安装依赖 + 配置
npm install
cp .env.example .env
vim .env  # 填入真实 API Key

# 验证
npm run typecheck  # 类型检查通过

# 后台运行（screen）
screen -S trueno
npm start
# Ctrl+A D 断开

# 查看日志
screen -r trueno
```

### 7.3 VPS 运维

```bash
# 进程守护（后续可加 PM2）
# 当前用 screen 即可

# 查看是否在跑
screen -ls | grep trueno

# 查看实时输出
screen -r trueno

# 如需重启
screen -r trueno   # 连入
Ctrl+C              # 停止
npm start           # 重启
Ctrl+A D            # 断开
```

### 7.4 升级路径

```
Phase 1 (当前 MVP)
  ├─ 信号引擎跑通，仅用 TrueNorth 数据
  ├─ Notion 日报稳定
  └─ 手动验证信号准确度

Phase 2 (验证后)
  ├─ 改 env: EXCHANGE_ENABLED=true, EXCHANGE_PROVIDER=okx
  ├─ 连接交易所获取独立 K 线 + 费率数据
  ├─ 改 env: DRY_RUN=false, AUTO_TRADE_ENABLED=false
  │   → 半自动模式：信号照出，人工确认后手动下单
  └─ 所有 env 参数不变

Phase 3 (成熟后)
  ├─ 改 env: AUTO_TRADE_ENABLED=true
  │   → 全自动模式：信号自动下单
  ├─ 前端页面（Vercel 部署）
  ├─ PM2 进程管理
  └─ 更多策略
```

---

## 8. 风险与局限

### 8.1 当前限制

| 限制 | 影响 | 缓解 |
|---|---|---|
| TrueNorth 依赖 Claude API | Claude 挂了系统歇菜 | 本地指标可承担 60% 功能 |
| 不自动下单 | 信号到执行的延迟 | 改 env: AUTO_TRADE_ENABLED=true 即可自动 |
| 无回测 | 策略参数缺数据验证 | 先跑纸面信号，观察 2-4 周再调参 |
| 币安禁用 | 币安 API 不可用 | EXCHANGE_PROVIDER=okx 切换到 OKX |

### 8.2 关键风险

| 风险 | 概率 | 应对 |
|---|---|---|
| Claude API 额度耗尽 | 中 | 缓存拉长 + 降低频率 |
| Notion API 变更 | 低 | 日报失败降级为本地 markdown |
| VPS OOM 导致进程挂 | 中 | 后续加 PM2 自动重启 |

---

## A. 补充说明

### A.1 为什么是 3 个策略而不是 4 个

旧方案有 4 个策略（资金费率套利、均值回归、清算预警、多因子轮动）。MVP 裁减原因：

| 移除 | 原因 |
|---|---|
| 清算级联预警 | 只监控不交易，MVP 不需要单独一个策略 |
| 多因子轮动 | 和均值回归重叠，已合并到评分体系 |

保留的 3 个有明确分工：**1 个主力做信号，2 个辅助提供日报上下文**。

### A.2 为什么不直接保留资金费率套利作为 MVP 策略

资金费率套利需要**开仓**才有收益，但 MVP 阶段不自动下单。改为"资金费率观察"，与套利逻辑完全相同，但只输出日报，Phase 2 再打开下单。

### A.3 为什么是币安+OKX 双通道

```
当前: 币安被封 → EXCHANGE_PROVIDER=okx → 连 OKX
解封后: 改一行 env → EXCHANGE_PROVIDER=binance → 连币安

两个交易所的 CCXT 接口完全一致（同一套代码），切换零成本。
OKX 需要多填一个 EXCHANGE_PASSWORD（API 创建时设置的密码短语）。

默认推荐 OKX:
- 国内 IP 通常不会被封
- 永续合约资金费率机制与币安一致
- JN-VC 的邀请码 JN188 也支持 OKX (20% 返佣)
```

### A.4 交易在哪个市场做

```
全部走 CEX 永续合约（U 本位），不走链上 DEX。

原因:
- TrueNorth 的资金费率/清算热力/OI 数据全部基于 CEX 合约市场
- 链上没有永续合约的费率机制，策略不匹配
- U 本位合约盈亏以 USDT 结算，便于计算和风控
```

### A.5 和 JN-VC 的对应关系

| JN-VC 功能 | Trueno Quant MVP |
|---|---|
| AI 策略信号 | 策略一：多因子评分信号 |
| Radar 妖币监控 | 策略二：市场异动监测 |
| (无直接对应) | 策略三：资金费率观察 |
| (无) | Notion 每日日报 |

---

*文档版本: MVP v1.0 | 最后更新: 2026-06-25*
