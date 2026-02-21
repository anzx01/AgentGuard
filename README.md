# AgentGuard

本地运行的 AI Agent API 安全代理网关。在 AI Agent 与外部 API（OpenAI、Stripe、Anthropic 等）之间建立安全控制层，提供预算管控、规则引擎、风险检测、审计日志和实时告警。

## 架构

```
AI Agent
   │
   │  X-AgentGuard-Token: ag_live_xxx
   ▼
Proxy Server :8080          ← 代理层（规则引擎 + 风险检测）
   │
   ▼
外部 API（OpenAI / Stripe / Anthropic ...）

Management API :3001        ← REST API + WebSocket
Dashboard :3000             ← Next.js 管理界面
```

## 功能

- **Agent 身份认证** — 每个 Agent 独立 token（`ag_live_xxx`），SHA-256 哈希存储
- **Kill Switch** — 一键暂停全局或单个 Agent 的所有请求
- **规则引擎** — 支持每日/月度预算、单次限额、频率限制、域名白/黑名单、时间窗口封锁
- **风险检测** — 金额异常（5倍均值）、深夜大额、连续失败自动告警
- **审计日志** — 全量请求记录，URL/Header 自动脱敏
- **告警通知** — 本地通知、Webhook（HMAC 签名）、邮件
- **Dashboard** — 实时总览、Agent 管理、日志查询、规则配置、设置

## 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 复制环境变量
cp packages/core/.env.example packages/core/.env

# 启动后端（API :3001 + Proxy :8080）
npm run dev --workspace=packages/core

# 启动前端（Dashboard :3000）
npm run dev --workspace=packages/dashboard
```

首次访问 `http://localhost:3000`，设置 Dashboard 登录密码。

### Docker 部署

```bash
docker-compose up -d
```

- Dashboard: `http://localhost:3001`
- Management API: `http://localhost:3000`
- Proxy: `http://localhost:8080`

## Agent 接入

1. 在 Dashboard → Agent 页面创建 Agent，保存返回的 token（仅显示一次）
2. 将 AI Agent 的 API 请求改为通过代理发送：

```
# 原始请求
POST https://api.openai.com/v1/chat/completions

# 改为
POST http://localhost:8080/proxy/openai/v1/chat/completions
X-AgentGuard-Token: ag_live_xxx...
```

内置服务别名：`openai` / `anthropic` / `stripe` / `google-ads`

自定义别名在 Dashboard → 设置 → 服务别名 中添加。

## 项目结构

```
AgentGuard/
├── packages/
│   ├── core/               # Node.js/TypeScript 后端
│   │   └── src/
│   │       ├── api/        # REST API 路由
│   │       ├── db/         # SQLite 初始化（12张表）
│   │       ├── engine/     # 规则引擎 + 风险检测
│   │       ├── proxy/      # HTTP 代理路由
│   │       └── services/   # KillSwitch / RateLimiter / BudgetManager / AuditLogger / AlertManager
│   └── dashboard/          # Next.js 14 前端
│       └── src/app/
│           ├── dashboard/  # 总览 / Agent / 日志 / 告警 / 规则 / 设置
│           └── login/
├── docker-compose.yml
└── package.json
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | Management API 端口 |
| `PROXY_PORT` | `8080` | 代理端口 |
| `BIND_ADDRESS` | `127.0.0.1` | 绑定地址 |
| `DB_PATH` | `./data/agentguard.db` | SQLite 数据库路径 |
| `JWT_SECRET` | 自动生成 | JWT 签名密钥 |

## 版本

- **Free**：1个 Agent，每规则集最多5条规则
- **Pro**：10个 Agent，无规则数量限制，在设置页激活许可证密钥（`AG-XXXX-XXXX-XXXX-XXXX`）
