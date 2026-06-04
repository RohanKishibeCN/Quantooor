# Base 链 DEX-DEX（USDC，UniswapV2/V3）跑通方案 Spec

## Why
当前仓库以“价差监控”为主（DexScreener/slot0 快照），对 DEX-DEX 来说缺少可执行报价与同币种校验，导致信号噪声大且不可落地。本变更以 Base 链为起点，用 USDC 作为统一计价，先跑通 Uniswap V2/V3 系 DEX-DEX 闭环，为后续接入 CEX-DEX 打基础。

## What Changes
- 新增 Base 链 DEX-DEX 专用的数据流：池发现 → 池注册表 → 链上报价 → 机会计算 → API/WS → Dashboard
- 新增 DEX 池注册表（Pool Registry），从 DexScreener 获取候选池并做去重/过滤/更新
- 新增链上报价引擎（Quote Engine）
  - Uniswap V2：基于 `getReserves()` 计算指定 `amountIn` 的 `amountOut`
  - Uniswap V3：基于 Quoter 合约对指定 `amountIn` 做 `quoteExactInputSingle`（或等价方式），避免仅用 slot0 推导
- 新增 DEX-DEX 机会引擎（仅 Base + USDC，单跳 TOKEN/USDC）
  - 同一 tokenAddress 的不同 DEX 之间计算“买入→卖出”闭环净利润
  - 输出可执行字段：amountIn/amountTokenOut/amountUsdcBack、priceImpact、费用、gas 估计、池地址等
- 新增 API/WS：暴露池列表、报价、机会列表；Dashboard 增加 DEX-DEX 视图与字段展示
- 增加“只运行 DEX-DEX（关闭 CEX/Gate/CoinGecko 扫描等）”的配置开关，保证 MVP 跑通路径干净可控

## Impact
- Affected specs: DEX 池发现、链上报价、机会计算、API/WS 实时推送、Dashboard 展示、配置与运行方式
- Affected code:
  - [api-server](file:///workspace/arbitrage-scanner/artifacts/api-server/src/index.ts)
  - [dexPoolScanner](file:///workspace/arbitrage-scanner/artifacts/api-server/src/lib/dexPoolScanner.ts)
  - [dexIngestion](file:///workspace/arbitrage-scanner/artifacts/api-server/src/lib/dexIngestion.ts)
  - [arbitrageDetection](file:///workspace/arbitrage-scanner/artifacts/api-server/src/lib/arbitrageDetection.ts)
  - [routes](file:///workspace/arbitrage-scanner/artifacts/api-server/src/routes)
  - [dashboard](file:///workspace/arbitrage-scanner/artifacts/arbitrage-dashboard/src/pages/dashboard.tsx)

## ADDED Requirements

### Requirement: 配置与范围（Base + USDC + UniV2/V3）
系统 SHALL 支持通过配置只启用 Base 链 DEX-DEX（USDC 计价、Uniswap V2/V3 系）的采集与机会计算。

#### Scenario: 启动仅 DEX-DEX
- **WHEN** 以“DEX-DEX 模式”启动 api-server
- **THEN** 仅启动 Base 链池发现/池注册表/报价引擎/DEX-DEX 机会引擎
- **AND** 不启动 CEX ingestion、Gate 扫描、CoinGecko top token 扫描等非必要任务

### Requirement: Pool Registry（候选池发现与归一化）
系统 SHALL 能在 Base 链上为 tokenAddress 发现并维护若干候选 TOKEN/USDC 池，供后续报价与机会计算使用。

#### Scenario: 从 DexScreener 发现池
- **WHEN** Pool Registry 周期性调用 DexScreener tokens API 获取指定 tokenAddress 的 pairs
- **THEN** 仅保留 Base 链、Uniswap V2/V3 系、USDC 计价的池
- **AND** 为每个 tokenAddress 维护 Top-N 候选池（按流动性/交易活跃度排序）

### Requirement: Quote Engine（可执行报价）
系统 SHALL 对指定池与指定 amountIn（以 USDC 为基准）给出链上可执行的报价结果。

#### Scenario: V2 报价
- **WHEN** 对某个 Uniswap V2 池请求 `quoteExactIn(amountInUSDC)`
- **THEN** 系统返回 amountOutToken 与有效成交价格、估计滑点、费用信息

#### Scenario: V3 报价
- **WHEN** 对某个 Uniswap V3 池请求 `quoteExactIn(amountInUSDC)`
- **THEN** 系统通过 Quoter 获取 amountOutToken 与费用信息，并返回有效成交价格与估计滑点

### Requirement: DEX-DEX Opportunity Engine（闭环利润）
系统 SHALL 仅在 Base 链上对同一 tokenAddress 的不同 DEX 池组合计算 USDC→TOKEN→USDC 的闭环净利润，并输出机会列表。

#### Scenario: 发现可执行机会
- **WHEN** 同一 tokenAddress 在至少两个不同 DEX 池上都能完成“买入+卖出”报价
- **THEN** 系统计算两方向闭环净利润（A 买 B 卖 / B 买 A 卖）
- **AND** 仅输出 `netProfitUsd > 0` 且超过最低利润阈值的机会

### Requirement: API + WS（对外消费）
系统 SHALL 提供可消费的 REST API 与 WebSocket 推送，支持 Dashboard 与后续执行器接入。

#### Scenario: 获取机会列表
- **WHEN** 调用 `GET /api/v1/dexdex/opportunities?minNetProfitUsd=...&limit=...`
- **THEN** 返回包含池地址、tokenAddress、amountIn、amountOut、netProfitUsd、gasUsd 等字段的列表

#### Scenario: 实时推送
- **WHEN** DEX-DEX 机会引擎刷新结果
- **THEN** 通过 WS 推送 `dexdex_opportunities_update`（topN 摘要）与可选的 `dexdex_opportunity`（单条机会）

### Requirement: Dashboard（最小可用展示）
系统 SHALL 在 Dashboard 中提供 DEX-DEX(Base/USDC) 的视图与筛选，展示可执行字段。

#### Scenario: 观察机会并复核
- **WHEN** 用户打开 Dashboard
- **THEN** 可看到 Base/USDC 的 DEX-DEX 机会列表与关键字段（token、DEX A/B、池地址、amountIn、netProfitUsd、liquidity、更新时间）

## MODIFIED Requirements

### Requirement: 现有 arbitrageDetection 不再作为 DEX-DEX 的核心来源
系统 SHALL 将 DEX-DEX 的机会计算从现有 `priceStore` 的快照比较中解耦出来，并以“可执行报价”为唯一信号源（priceStore 可继续用于展示/兼容）。

## REMOVED Requirements
无（本阶段不移除旧能力，仅通过配置绕开非目标路径）。

