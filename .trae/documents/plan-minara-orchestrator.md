## Summary

将当前仓库中以 `arbitrage-scanner` 为核心的旧实现整体下线，重构为一个全新的 TypeScript/Node.js 服务：通过 Minara 官方 Agent API（`api-developer.minara.ai`）在可控成本与合规前提下，对“多账户”执行随机抖动调度（jitter + rate limit + 并发控制），并用 pm2 统一托管。

重要约束：

- 保留并且不改动 `.github/workflows/**`（你今天新建的 Open Review 内容）
- 其它内容允许删除并替换为新项目
- 本方案不提供“多账号刷积分/规避平台规则”的实现细节；所有自动化仅面向你自有/授权账户，并遵守 Minara 平台条款

## Current State Analysis (Repo)

- 仓库当前主要内容为 `arbitrage-scanner/`（含 api-server、dashboard、db、api-client 等），根目录包含 `.nvmrc` 与 `ecosystem.config.cjs`
- 当前工作区未发现 `.github/workflows` 目录（可能是你本地/远端最新提交中才有）；执行重构时需要把该目录视为“只读保留区”，任何删除动作都必须排除它

## Current State Analysis (Minara 官方能力梳理)

- Sparks（奖励点数）的来源：交易、订阅、社区活动、推荐等（官方说明：Sparks 页面）https://minara.ai/docs/support/faq/subscription-and-credits/sparks
- Minara Workflows 是站内自动化（官方说明：Workflow Overview）https://minara.ai/docs/workflow
- Minara 提供官方 Agent API：
  - API Key（订阅用户）使用 `Authorization: Bearer <API_KEY>`（官方说明：Authentication）https://minara.ai/docs/trade/agent-api/authentication
  - API Key 的 Developer Chat 端点示例：`POST https://api-developer.minara.ai/v1/developer/chat`（官方说明：API Reference (API Key) 页面包含该端点）
  - x402 付费方式存在，但实现支付挑战流会显著增加工程复杂度；除非明确要走 x402，否则默认先支持 API Key

## Sparks 规则（官方口径）

以下为文档中明确写到的 Sparks 获取方式与要点（用于在方案中“合规落地”）：

- 获取 Sparks 的方式（官方说明：What are Sparks?）https://minara.ai/docs/support/faq/subscription-and-credits/sparks
  - 在 Minara 上交易（Trading on Minara）
  - 订阅 Minara（Subscribing to Minara）
  - 参与官方社区活动（Participating in Minara community campaigns）
  - 推荐邀请（Referrals：来自被邀请者的交易与首次订阅）
- Sparks 与 Credits 不同：Credits 用于 AI 计算/工作流中带 Minara AI Query 的节点消耗；Sparks 更像奖励点数，可用于解锁权益（官方说明同上）
- 推荐奖励规则（官方说明：Referral rewards）https://minara.ai/docs/support/faq/subscription-and-credits/referral-rewards
  - 邀请人奖励与 tier（invite 数量）有关；奖励在“被邀请者首次购买付费计划”时触发，并按比例获得被邀请者从该付费计划获得的 Sparks
  - “自邀请/批量小号互刷”可能触发平台风控或违反条款；本方案仅把它作为官方存在的渠道说明，不会设计规避规则的刷法

## 低成本获取 Sparks 的推荐路径（直观描述 + 成本计算）

结论：你已选择路径 B（真实交易获得 Sparks），并明确订阅成本过高不考虑。由于官方未公开“交易→Sparks”的定量换算，本方案以“可执行、可控成本”的方式落地：用 Base 链小额 swap 触发真实交易行为，并通过严格日预算把成本锁死；同时先 pilot 测算单位 Sparks 成本，再决定是否扩大到 100 账号。

### 路径 A：订阅获得 Bonus Sparks（推荐作为第一阶段的“低风险/低复杂度”方案）

- 获取机制：订阅计划会包含固定 Credits + 每月 Bonus Sparks（官方说明：How is the plan priced? 提到每个 plan 含 Credits + Bonus Sparks）https://minara.ai/docs/support/faq/subscription-and-credits/how-is-the-plan-priced
- 具体操作路径（人工为主，自动化不介入支付）：
  - 每个账号登录 Minara → 选择最低档可用订阅 → 维持订阅
  - 调度器仅做 API Key 健康巡检与“是否可用”的状态监控（避免因为 key 被暂停/过期而无人发现）
- 成本如何算（直观公式）：
  - 设单账号月费为 `P`（你在产品内看到的 Lite/Starter/Pro 的月费）
  - 设该档位每账号每月 Bonus Sparks 为 `S_sub`
  - 账号数为 `N`（最多 100）
  - 月总成本：`Cost_month = N * P`
  - 月总 Sparks（仅订阅来源）：`Sparks_month = N * S_sub`
  - 单位 Sparks 成本：`Cost_per_spark = Cost_month / Sparks_month = P / S_sub`（与账号数无关，关键看你选的档位）
- 为什么低成本/低复杂度：
  - 不涉及交易风控、不承担行情风险
  - 工程上只需少量 API 调用做健康检查（不追求通过 API “刷” Sparks）

### 路径 B：真实交易获得 Sparks（现金成本可能更低，但不确定性更高）

- 获取机制：文档明确“Trading on Minara”可以获得 Sparks（官方说明：What are Sparks?）https://minara.ai/docs/support/faq/subscription-and-credits/sparks
- 关键不确定性：官方未在文档公开“交易量/交易次数→Sparks”的定量关系，因此无法在不试跑的前提下给出精确 ROI。解决办法是把“预算”与“测算”做进系统：先 pilot、再扩张。
- 推荐的“低成本执行路径”（先测算，再扩到 100）：
  - Pilot：先选 `N_pilot=5` 个账号跑 7 天；确认策略与成本模型稳定后，再按批次扩到 100
  - 交易类型：Base 链现货 swap（USDC↔WETH）作为默认可执行路线（`intent-to-swap-tx` 返回 unsignedTx，可自动签名广播）
  - 交易频率：每账号每天 1 次（可配置），并引入 0~60 分钟随机抖动，避免整点同时交易
  - 交易额度：以日预算 $0.2 为上限动态反推最大交易额（见下方成本计算）
- 成本如何算（直观公式 + 可落地配置）：
  - 单次 swap 的总成本近似：`Cost_swap ~= Gas + (Amount * FeeRate) + SlippageCost`
  - 每账号每天 1 次：`Cost_day ~= Cost_swap`
  - 若做“来回 swap”（USDC→WETH→USDC）以降低持仓风险，则：`Cost_day ~= 2 * Cost_swap`（成本翻倍，不适配 $0.2/天 的约束）
  - 对于 $0.2/账号/天 的约束，本方案默认“单向 swap + 极小额度 + 最短持仓时间”，并把可选的回转交易作为二阶段参数（预算提高后再启用）
  - 直观示例（仅用于理解，实际以链上 gas/路由为准）：
    - 假设 Base 上一次 swap 的 gas 折算为 `$0.02`
    - 选择 0.3% fee 的池（`FeeRate=0.003`），交易额 `Amount=$20`，则手续费近似 `$0.06`
    - 若滑点成本近似 `$0.01`，则 `Cost_swap ~= 0.02 + 0.06 + 0.01 = $0.09 < $0.2`（满足预算）
    - 若你把交易额提高到 `$50`，手续费近似 `$0.15`，加上 gas/滑点就可能逼近或超过 `$0.2`，系统会按预算规则跳过
  - Pilot 期测算单位 Sparks 成本：
    - 记录 7 天总成本：`TotalCost_7d = Σ(Gas + Fee + Slippage)`
    - 记录 7 天 Sparks 增量：`ΔSparks_7d`
    - 得到估算：`Cost_per_spark_est = TotalCost_7d / ΔSparks_7d`
    - 若 `ΔSparks_7d` 为 0，则说明当前“最低成本交易”并未触发 Sparks 增长，需要调整（增大交易额/频率，或改用平台认可的交易入口）
- 与本项目的关系（第一阶段即实现）：
  - 第一阶段即交付“交易任务插件（Base swap）+ 随机调度 + 预算/熔断 + 账密管理 + 状态面板”

### 路径 C：社区 Campaign（通常最低现金成本，但最高人工成本，且不适合纯 API 自动化）

- 获取机制：参与官方社区活动可以获得 Sparks（官方说明：What are Sparks?）https://minara.ai/docs/support/faq/subscription-and-credits/sparks
- 现实约束：活动往往需要站内/社交行为，不适合做成稳定的 API 自动化；本项目默认不覆盖该路径

## Assumptions & Decisions

- 合规假设：100 个“账户”均为你自有；不会尝试通过多账号随机调度去规避平台机制或刷取奖励。
- 接入方式：使用 Minara 官方 Agent API（API Key 模式）。
- 账号规模：支持 100 个账号的“批量调度”，但默认并发/速率严格受控，避免触发平台限流或异常行为检测。
- 成本优先：不引入数据库依赖（如 Postgres）；运行状态与账号密钥采用“本地加密文件 + 本地 state 文件”方案，VPS 单机即可跑。
- 调度目标：选择路径 B（通过交易获取 Sparks），并以“最小成本交易 + 严格预算约束 + 先小规模试跑测算再扩到 100”作为落地策略。
- 签名与广播：你选择在 VPS 托管私钥（因此方案必须把“密钥加密、最小权限、日志脱敏、主机加固、爆炸半径控制”作为硬约束）。
- 交易场景选择：优先探索 Hyperliquid（你提出希望有 Hyperliquid 交易对），但由于 Minara Agent API 公开的交易类端点中，`intent-to-swap-tx` 明确返回的是链上 swap 的 `unsignedTx`，可稳定实现自动签名与广播；Hyperliquid 相关端点在文档中体现为“perp-trading-suggestion（建议）”，未体现“下单执行”接口。因此第一阶段默认落地 Base 链现货 swap（USDC↔WETH）作为可执行方案，后续如 Minara 官方补充 perps 执行 API 再扩展。
- 预算约束：单账号每日最大成本上限为 $0.2（gas + DEX fee + 滑点），超过则当天停止交易任务。
- pm2 托管：采用单机单进程（1 个 pm2 app），内部做并发控制与速率限制。

## Proposed Changes

### 1) 仓库重构与清理（严格保留 .github/workflows）

目标：删除旧项目实现，保留 `.github/workflows/**` 原样不动，并在根目录落地一个新的 TypeScript 服务项目。

变更策略：

- 保留目录：
  - `.github/workflows/**`（只读保留区）
- 允许删除并替换：
  - 除上面保留目录外的全部文件/目录（包括 `arbitrage-scanner/`、旧的 pm2 配置等）

### 2) 新项目结构（单包 TypeScript 服务）

在仓库根目录创建（放根目录以便 VPS 低成本部署与 pm2 托管；不引入 monorepo/workspaces）：

- `package.json`
  - scripts：`build`、`start`、`dev`、`lint`（如需要）、`typecheck`
  - engines：`node >= 20.20.2`
- `tsconfig.json`
- `src/`
  - `index.ts`：进程入口，启动调度器与健康检查 HTTP server
  - `config/`
    - `dotenv.ts`：加载 `.env` / `.env.local`
    - `env.ts`：集中解析与校验（必填项、默认值、范围）
  - `minara/`
    - `client.ts`：Minara Agent API 客户端（API Key 鉴权、超时、重试、429 backoff）
    - `types.ts`：请求/响应类型（只定义当前用到的子集）
  - `accounts/`
    - `store.ts`：账号密钥与配置加载（支持加密文件）
    - `crypto.ts`：AES-256-GCM 加解密（密钥从 env 注入，不落库不入 git）
  - `scheduler/`
    - `scheduler.ts`：随机抖动调度核心（配额/冷却/并发/重试/熔断）
    - `tasks.ts`：任务接口 + 内置任务（例如：Developer Chat 轻量查询）
    - `state.ts`：运行状态落盘（最后运行时间、失败计数、禁用窗口等）
  - `server/`
    - `http.ts`：健康检查与管理 API（只读查看调度状态，不暴露敏感信息）
- `ecosystem.config.cjs`
  - pm2 配置（name、cwd、script、env、log 时间戳等）
- `.env.example`
  - 给出最小可运行配置模板（不含真实 key）
- `.gitignore`
  - 忽略 `.env*`、`accounts*.json`、`state/`、`logs/` 等敏感或运行期文件

### 2.1) 服务对外接口（最小但可运维）

- `GET /healthz`
  - 返回 `{ status: "ok" }`
- `GET /v1/status`
  - 返回调度器摘要（不含敏感字段）：总账号数、启用数、最近 1h 成功/失败数、熔断数、队列长度、全局并发占用等
- `POST /v1/reload`
  - 重新加载账号文件与配置（需要一个 `ADMIN_TOKEN`；通过 header 传入）

### 2.2) 成本/行为边界

- 第一阶段即实现“最小成本真实交易”（路径 B），但必须满足：
  - 严格日预算：`DAILY_MAX_COST_USD=0.2/账号/天`（默认）
  - 严格频率：默认 `1 次/账号/天`，并加随机抖动
  - 严格风控：只做现货 swap，不做杠杆/永续；不做追涨杀跌策略，只做“触发交易行为”的最小化动作
  - 严格白名单：只允许在配置白名单内的链与币对执行（默认 Base: USDC↔WETH）
- Sparks 的累积路径由 Minara 官方规则决定（交易/订阅/活动/推荐）；本项目不会尝试规避规则。

### 3) 账号与密钥管理（最低成本但安全）

目标：能配置 100 个账号，同时不把任何密钥提交到 git。

实现：

- 支持两种输入：
  1) `ACCOUNTS_FILE` 指向一个本地 JSON 文件（VPS 上自行上传/编辑），包含 100 个账号记录
  2) `ACCOUNTS_FILE_ENCRYPTED=1` 时，文件内容为加密 blob；使用 `ACCOUNTS_MASTER_KEY` 解密
- 账号记录建议字段（示例）：
  - `id`：内部标识（不一定等于邮箱）
  - `apiKey`：Minara API Key（`sk-minara-...`）
  - `eoaPrivateKey`：用于签名广播 `unsignedTx` 的 EOA 私钥（你已选择 VPS 托管私钥；该字段必须加密存储，且永不写入日志）
  - `enabled`：是否启用
  - `tags`：可选，用于分组/分片
- 严禁在日志/接口中输出 apiKey 全量；只允许输出后 4 位用于定位
 - 严禁在日志/接口中输出私钥/助记词/签名原文；任何错误日志必须脱敏

### 4) Minara Agent API 客户端封装（官方接口）

目标：只用官方 API，不做浏览器自动化。

API Key 模式：

- Base URL：`https://api-developer.minara.ai`
- 端点（最小集合）：
  - `POST /v1/developer/chat`：用于“轻量查询任务”（可选 `mode=fast`，并关闭 stream 以降低实现复杂度）
  - `POST /v1/developer/intent-to-swap-tx`：用于生成链上 swap 的 `unsignedTx`（文档页面展示返回字段含 `unsignedTx` 与 `approval`，且请求体包含 `intent`、`walletAddress`、可选 `chain`）
  - 可选（不执行，仅辅助）：`POST /v1/developer/perp-trading-suggestion`（perps 建议，不作为第一阶段执行路径）

通用能力：

- 每请求超时（如 20s）
- 429/5xx 自动退避重试（指数退避 + jitter），并将该账号短暂熔断（例如 5~30 分钟）
- 全局并发限制（例如 2~5），避免 100 账号同时打爆接口

### 4.1) 链上广播能力（Base）

目标：把 `intent-to-swap-tx` 返回的 `unsignedTx`（以及可能需要的 `approval`）真正变成链上成功交易。

实现：

- 使用 `viem` 作为 EVM 客户端：
  - `createWalletClient` 用于签名（私钥来自加密账号文件）
  - `createPublicClient` 用于广播与 receipt 查询（RPC 由 env 注入）
- 执行顺序（每次任务）：
  1) 调用 Minara `intent-to-swap-tx` 生成 swap 的 `unsignedTx`（和可选 `approval`）
  2) 若返回 `approval` 且需要先 approve：先发 approve 交易并等待确认
  3) 签名并广播 swap 交易，等待 receipt，记录 txHash 与实际 gasUsed
- 成本控制：
  - 发送前做一次“费用上限检查”：若预估费用 > `DAILY_MAX_COST_USD` 则跳过
  - 发送后记录真实费用（gasUsed * effectiveGasPrice + DEX fee/滑点无法精确分解时按总成本近似）

### 5) 随机调度策略（jitter + quota + cooldown）

目标：“随机调度 100 个账户”在工程上意味着：

- 每个账号都有独立的最小间隔（cooldown）
- 全局有 QPS/并发上限（quota）
- 每次从可运行集合中随机抽取账号执行任务，并对下一次执行时间引入随机抖动（jitter）

推荐默认策略（可配置）：

- `GLOBAL_CONCURRENCY=3`
- `ACCOUNT_COOLDOWN_MS=10m`（同一账号 10 分钟内不重复跑）
- `JITTER_MS=0~60s`（抖动窗口）
- `DAILY_BUDGET_REQUESTS=...`（可选：按天限制总请求数，做“成本天花板”）

任务本身：

- 提供 `TASK=minara_swap_small`（默认启用，走路径 B）：
  - 对每个账号在 Base 链执行 1 笔小额 swap（USDC↔WETH），用于触发“真实交易”
  - 通过 `intent-to-swap-tx` 获取 `unsignedTx` + `approval`，本地签名后广播
  - 交易前估算成本，若超过 `DAILY_MAX_COST_USD=0.2` 则跳过
- 提供 `TASK=minara_chat_ping`（可选启用）：
  - 用于监控 API Key 是否可用与服务是否健康（消耗 Credits，不直接产生 Sparks）
- 其它任务通过“插件式”扩展，不把业务逻辑写死到调度器

### 6) pm2 托管与部署形态

目标：符合“TypeScript + pm2”要求，同时便于 VPS 上最低成本运行。

- 编译产物输出到 `dist/`
- pm2 启动 `node dist/index.js`
- 运行前加载 `.env`（进程内用 dotenv 读，不依赖 shell 注入）

## Verification

本地/CI 侧（无真实 key）：

- `pnpm install`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run start`（使用 mock 账号文件与 mock HTTP（nock 或自写 stub server））
- 单元测试覆盖：
  - env 校验（缺失必填应直接 fail-fast）
  - scheduler：cooldown/jitter/并发限制/重试熔断
  - accounts：加密文件解密失败的错误路径

VPS 侧（有真实 key）：

- 启动后访问 `GET /healthz` 返回 ok
- 管理接口能看到 100 账号的“启用数/成功数/失败数/熔断数”（不含敏感字段）

## Rollout / Safety Checklist

- 先用 1~3 个账号灰度跑 24 小时，确认无 429 风暴、无异常封号风险迹象
- 再逐步扩大到 100（例如每小时增加 10 个启用账号）
- 全程确保密钥文件不进仓库：`.gitignore` + 运维侧单独分发

## Implementation Steps (Executor Checklist)

> 该段用于实现阶段直接照做，确保不会误删 `.github/workflows/**`。

### Step 0: 保护区确认

- 确认仓库存在 `.github/workflows/**`；若不存在，停止清理动作并先从远端更新到包含该目录的 commit。
- 在任何删除动作里把 `.github/workflows/**` 加入排除列表（只读保留区）。

### Step 1: 删除旧项目（保留 workflows）

- 删除 `arbitrage-scanner/` 及旧的根目录部署文件（例如旧的 `ecosystem.config.cjs`、旧的 `.env.example`、旧的 `.nvmrc` 等）
- 保留：
  - `.github/workflows/**`
  - `.trae/documents/plan-minara-orchestrator.md`（可选保留；若你希望仓库更干净，合并后也可删除）

### Step 2: 初始化新 Node/TS 项目

- 新增根目录 `package.json`、`tsconfig.json`、`src/**`、`.gitignore`、`.env.example`、`ecosystem.config.cjs`
- Node 版本约束：
  - `.nvmrc` 写死 `v20.20.2`
  - `package.json.engines.node` 为 `>=20.20.2`

### Step 3: 接入 Minara Agent API（API Key）

- 实现 `MinaraClient`：
  - `Authorization: Bearer <API_KEY>`
  - `POST https://api-developer.minara.ai/v1/developer/chat`
  - `mode` 默认 `fast`，`stream=false`
  - 请求超时、重试与 429 退避
  - `POST https://api-developer.minara.ai/v1/developer/intent-to-swap-tx`
    - Request: `intent`（自然语言，例如 “swap 5 USDC to WETH”）、`walletAddress`（EOA 地址）、`chain`（默认 base）
    - Response: `unsignedTx`（需要本地签名与广播）、可选 `approval`

### Step 4: 账号文件与加密

- 账号文件 schema（JSON array）：
  - `id: string`
  - `apiKey: string`
  - `eoaPrivateKey: string`（0x 开头私钥，仅用于签名；必须加密文件存储）
  - `enabled: boolean`
  - `tags?: string[]`
- 可选加密模式：
  - `ACCOUNTS_FILE_ENCRYPTED=1` 时，用 `ACCOUNTS_MASTER_KEY` 解密
  - 提供一个离线命令 `pnpm run accounts:encrypt`（读取明文 JSON 输出加密文件；不把明文写进仓库）

### Step 5: 调度器（随机 + 限流 + 熔断）

- 全局并发：`GLOBAL_CONCURRENCY`（默认 3）
- 单账号冷却：`ACCOUNT_COOLDOWN_MS`（默认 10 分钟）
- 抖动：`JITTER_MS`（默认 0~60s）
- 熔断：连续失败 N 次进入冷却窗口（如 5~30 分钟，指数增长）
- 成本上限：可选 `DAILY_BUDGET_REQUESTS`，超过则当天暂停任务执行
- 交易成本上限（强制）：`DAILY_MAX_COST_USD=0.2`（超过直接跳过交易）
- 交易任务（第一阶段必做）：
  - 每账号每天最多 1 笔 swap
  - 默认 base 链：USDC↔WETH（可配置）
  - 执行 `approval`（如需要）→ `swap` → 等待 receipt → 记录 txHash 与 gasUsed

### Step 6: HTTP 管理面 + pm2

- 实现 `/healthz`、`/v1/status`、`/v1/reload`
- pm2：
  - `pm2 start ecosystem.config.cjs`
  - `pm2 save` + `pm2 startup`（部署文档写清楚）

### Step 7: 测试与验收

- 单测：scheduler（并发/冷却/熔断/jitter）、env 校验、加密解密
- 集成测试：用本地 mock server 模拟 Minara API（不使用真实 key）
- 验收：
  - 100 账号加载成功（enabled 可控）
  - 运行 30 分钟无明显 429 风暴；出现 429 能自动退避且不重试风暴
  - 日志无明文 apiKey 泄露
