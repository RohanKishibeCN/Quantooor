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

- 合规假设：100 个“账户”均为你自有或客户明确授权管理；不会尝试通过多账号随机调度去规避平台机制或刷取奖励。
- 接入方式：优先使用 Minara 官方 Agent API（API Key 模式）。如果你希望走 x402（按次付费）再单独扩展。
- 账号规模：支持 100 个账号的“批量调度”，但默认并发/速率严格受控，避免触发平台限流或异常行为检测。
- 成本优先：不引入数据库依赖（如 Postgres）；运行状态与账号密钥采用“本地加密文件 + 本地 state 文件”方案，VPS 单机即可跑。
- pm2 托管：仅托管 1 个 Node 进程（内部再做并发控制）。需要水平扩展时再考虑 pm2 cluster 或多实例分片。

## Proposed Changes

### 1) 仓库重构与清理（严格保留 .github/workflows）

目标：删除旧项目实现，保留 `.github/workflows/**` 原样不动，并在根目录落地一个新的 TypeScript 服务项目。

变更策略：

- 保留目录：
  - `.github/workflows/**`（只读保留区）
- 允许删除并替换：
  - 除上面保留目录外的全部文件/目录（包括 `arbitrage-scanner/`、旧的 pm2 配置等）

### 2) 新项目结构（单包 TypeScript 服务）

在仓库根目录创建（或 `apps/minara-orchestrator/`，二选一，默认放根目录以便部署简单）：

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
  - 若你明确需要“生成可执行交易意图”，再加：
    - `POST /v1/developer/intent-to-swap-tx`（文档显示存在该端点，但需要你确认具体 payload 与链/资产范围）

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

- 提供 `TASK=minara_chat_ping`：对每个账号发一个固定的低成本 prompt（例如“输出当前 BTC 价格与关键支撑位”），验证账号可用性与调度系统稳定性
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

