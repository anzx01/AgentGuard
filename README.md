# AgentGuard

本地运行的 AI Agent API 安全代理网关。在 AI Agent 与外部 API（OpenAI、Stripe、Anthropic 等）之间建立安全控制层，提供预算管控、规则引擎、风险检测、审计日志和实时告警。

![1771714011584](image/README/1771714011584.png)

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

## OpenClaw 集成

OpenClaw 是一个支持多 LLM 提供商的 AI Agent 框架。通过 AgentGuard，你可以对 OpenClaw 的所有 API 调用进行预算管控、风险检测和审计。

### 步骤一：在 AgentGuard 创建 Agent 并配置上游 Key

1. 打开 Dashboard → Agent → 新建 Agent
2. 填写名称（如 `openclaw`）
3. **上游 API Key** 填入你的真实 OpenAI 或 Anthropic API Key（如 `sk-...`）
4. 保存后复制返回的 AgentGuard Token（`ag_live_xxx...`，仅显示一次）

### 步骤二：配置 OpenClaw

在 OpenClaw 的配置文件中，将 provider 的 `baseUrl` 指向 AgentGuard 代理，`apiKey` 填入 AgentGuard Token：

**使用 OpenAI 模型：**

```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-4o" }
    }
  },
  "providers": {
    "openai": {
      "baseUrl": "http://localhost:8080/proxy/openai",
      "apiKey": "ag_live_xxxxxxxxxxxxxxxx"
    }
  }
}
```

**使用 Anthropic 模型：**

```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "anthropic/claude-opus-4-6" }
    }
  },
  "providers": {
    "anthropic": {
      "baseUrl": "http://localhost:8080/proxy/anthropic",
      "apiKey": "ag_live_xxxxxxxxxxxxxxxx"
    }
  }
}
```

### 工作原理

```
OpenClaw
   │  Authorization: Bearer ag_live_xxx   ← AgentGuard Token 作为 API Key
   ▼
AgentGuard Proxy :8080
   │  验证 Token → 规则检查 → 风险检测 → 注入真实 API Key
   ▼
OpenAI / Anthropic API
```

AgentGuard 自动将 `ag_live_xxx` 替换为你在 Agent 配置中存储的真实 API Key，OpenClaw 无需持有真实密钥。

### 可配置的管控规则（Dashboard → 规则）

| 规则类型 | 示例 |
|---|---|
| 每日预算上限 | $5/天，超出自动阻断 |
| 单次请求限额 | 单次不超过 $0.5 |
| 频率限制 | 每分钟最多 20 次 |
| 时间窗口封锁 | 凌晨 0-6 点禁止请求 |
| Kill Switch | 一键暂停 OpenClaw 的所有 API 调用 |

## 其他 Agent 接入

对于不支持自定义 baseUrl 的工具，使用显式 Header 方式：

```
POST http://localhost:8080/proxy/openai/v1/chat/completions
X-AgentGuard-Token: ag_live_xxx...
Authorization: Bearer sk-your-real-openai-key
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

| 变量             | 默认值                   | 说明                |
| ---------------- | ------------------------ | ------------------- |
| `PORT`         | `3001`                 | Management API 端口 |
| `PROXY_PORT`   | `8080`                 | 代理端口            |
| `BIND_ADDRESS` | `127.0.0.1`            | 绑定地址            |
| `DB_PATH`      | `./data/agentguard.db` | SQLite 数据库路径   |
| `JWT_SECRET`   | 自动生成                 | JWT 签名密钥        |

## 版本

- **Free**：1个 Agent，每规则集最多5条规则
- **Pro**：10个 Agent，无规则数量限制，在设置页激活许可证密钥（`AG-XXXX-XXXX-XXXX-XXXX`）
