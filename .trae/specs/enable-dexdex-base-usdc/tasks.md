# Tasks
- [x] Task 1: 增加 DEX-DEX 模式开关与启动编排
  - [x] 将 api-server 启动逻辑改为可配置启用/禁用各扫描器（DEX-DEX 模式默认只启用 Base DEX-DEX）
  - [x] 增加 Base/USDC/UniswapV2-V3 相关配置项（USDC 地址、Quoter 地址、RPC URL、阈值等）并提供安全默认值/校验

- [x] Task 2: 实现 Pool Registry（Base、USDC、UniswapV2/V3）
  - [x] 从 DexScreener 拉取 tokenAddress 的 pairs，过滤：chain=base、quote=USDC、dex=Uniswap 系
  - [x] 归一化 tokenAddress/quoteAddress、处理 base/quote 方向（确保“tokenAddress 固定为非 USDC 资产”）
  - [x] 为每个 tokenAddress 维护 Top-N 候选池（排序：liquidityUsd、txns、volume）
  - [x] 提供内存缓存与刷新周期，避免全量重扫造成限流

- [x] Task 3: 实现 Quote Engine（可执行报价）
  - [x] Uniswap V2：通过 viem 读取 reserves，计算 exact-in 报价（USDC→TOKEN、TOKEN→USDC）
  - [x] Uniswap V3：通过 Quoter 合约对 exact-in 报价（USDC→TOKEN、TOKEN→USDC）
  - [x] 统一输出 QuoteResult：amountIn、amountOut、effectivePrice、fee、估计 priceImpact、必要元数据（pool、token、chain）
  - [x] 引入 BigInt/定点数处理，避免 number 精度风险（仅展示层转 number）

- [x] Task 4: 实现 DEX-DEX Opportunity Engine（Base/USDC）
  - [x] 基于 Pool Registry 的候选池组合，对同一 tokenAddress 做 A 买 B 卖 / B 买 A 卖 两方向闭环
  - [x] 成本模型：V2/V3 swap fee + gasUsd（可配置、可按链写死 MVP 值）
  - [x] 过滤与风控：minNetProfitUsd、minNetProfitBps、minLiquidityUsd、maxPriceImpactBps、黑名单 token
  - [x] 输出 DEX-DEX 机会结构，包含执行所需字段（池地址、tokenAddress、amountIn、amountOut、gasUsd）

- [x] Task 5: 增加 API + WS 端点
  - [x] `GET /api/v1/dexdex/pools`：查看当前池注册表（按 token/DEX/流动性过滤）
  - [x] `POST /api/v1/dexdex/quote`：对指定池/方向/amountIn 返回实时报价（用于复核）
  - [x] `GET /api/v1/dexdex/opportunities`：返回当前机会列表（支持 minNetProfitUsd/limit）
  - [x] WS：推送 `dexdex_opportunities_update`（topN 摘要）与可选 `dexdex_opportunity`

- [x] Task 6: Dashboard 支持 DEX-DEX(Base/USDC)
  - [x] 增加 DEX-DEX 视图与筛选（链=Base、quote=USDC）
  - [x] 机会列表展示可执行字段（token、dexA/dexB、pool、amountIn、netProfitUsd、priceImpact、liquidity）
  - [x] 兼容现有 WS 消息与 API client 生成方式（OpenAPI/Orval 如需扩展）

- [x] Task 7: 验证与测试
  - [x] 单元测试：V2 报价公式、机会计算（使用固定输入/模拟 reserves）
  - [x] 集成验证：在 Base 公共 RPC 上对少量白名单 token 跑一轮 registry→quote→opportunity（允许跳过 CI，提供本地可运行命令）
  - [x] 性能验证：限制并发/批量调用策略，确保不会对 RPC 或 DexScreener 造成尖峰

- [x] Task 8: 对齐 DEX-DEX opportunities API 字段（对应 checklist #6）
  - [x] `GET /api/v1/dexdex/opportunities` 返回补齐/对齐 amountIn、amountOut、liquidity、priceImpact 等字段（当前主要字段为 amountInUsdc/amountUsdcBack、priceImpactBps、buyPool/sellPool.liquidityUsd）
  - [x] 保持向后兼容：不要破坏现有字段；必要时同时输出新旧字段

- [x] Task 9: 修复 Dashboard 对 DEX-DEX opportunities 的适配与最小筛选（对应 checklist #8）
  - [x] Dashboard 解析支持 buyPool/sellPool 嵌套结构（当前仅尝试 flat 字段：buyDexId/buyPoolAddress 等）
  - [x] 提供最小筛选能力：支持 minNetProfitUsd 或可配置 limit（UI 或等价参数能力）

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 2 and Task 3
- Task 5 depends on Task 4
- Task 6 depends on Task 5
- Task 7 depends on Task 1-6
