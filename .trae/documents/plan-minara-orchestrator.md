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

## Assumptions & Decisions

- 合规假设：100 个“账户”均为你自有；不会尝试通过多账号随机调度去规避平台机制或刷取奖励。
- 接入方式：使用 Minara 官方 Agent API（API Key 模式）。
- 账号规模：支持 100 个账号的“批量调度”，但默认并发/速率严格受控，避免触发平台限流或异常行为检测。
- 成本优先：不引入数据库依赖（如 Postgres）；运行状态与账号密钥采用“本地加密文件 + 本地 state 文件”方案，VPS 单机即可跑。
- 调度目标：你当前不确定 Sparks 的具体获取路径，且暂不做交易；因此第一阶段交付“通用随机调度框架 + 可插拔任务系统”，默认只跑低成本的 API 健康任务与可用性巡检。后续一旦你决定通过订阅或真实交易来累积 Sparks，再按插件方式加任务。
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

- 第一阶段不实现任何“自动交易”或“自动化参与社区活动”的行为，只做：
  - API Key 可用性巡检
  - 限流友好的随机调度框架（为第二阶段扩展做准备）
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
  - `enabled`：是否启用
  - `tags`：可选，用于分组/分片
- 严禁在日志/接口中输出 apiKey 全量；只允许输出后 4 位用于定位

### 4) Minara Agent API 客户端封装（官方接口）

目标：只用官方 API，不做浏览器自动化。

API Key 模式：

- Base URL：`https://api-developer.minara.ai`
- 端点（最小集合）：
  - `POST /v1/developer/chat`：用于“轻量查询任务”（可选 `mode=fast`，并关闭 stream 以降低实现复杂度）
  - 预留扩展位（第二阶段才做）：`POST /v1/developer/intent-to-swap-tx`（用于生成可执行交易意图；是否启用取决于你后续是否要做真实交易任务）

通用能力：

- 每请求超时（如 20s）
- 429/5xx 自动退避重试（指数退避 + jitter），并将该账号短暂熔断（例如 5~30 分钟）
- 全局并发限制（例如 2~5），避免 100 账号同时打爆接口

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

- 提供 `TASK=minara_chat_ping`：对账号发固定、低复杂度 prompt（例如“输出当前 BTC 价格与关键支撑位”），用于验证账号可用性、API Key 有效性、以及调度稳定性。该任务消耗的是 Minara Credits（而非直接发放 Sparks）；Sparks 的累积仍以官方定义的订阅/交易/活动为准。
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

### Step 4: 账号文件与加密

- 账号文件 schema（JSON array）：
  - `id: string`
  - `apiKey: string`
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
