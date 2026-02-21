# AgentGuard 产品需求文档 (PRD) v1.0

> 文档版本：1.0 | 日期：2026-02-21 | 状态：正式稿

---

# 一、产品概述

## 1.1 产品定位

AgentGuard 是一个**本地部署的 AI Agent API 安全代理网关**。它作为 AI Agent 与外部 API 之间的透明拦截层，通过规则引擎、预算管控、频率限制和异常检测，防止 AI Agent 失控导致的意外支出、数据泄露或服务滥用。

**核心价值主张**：让开发者在不修改 Agent 核心逻辑的前提下，对 Agent 的所有外部 API 调用实施可审计、可控制、可追溯的安全管控。

## 1.2 目标用户

| 用户群体 | 描述 |
|---------|------|
| 独立开发者 / 个人创业者 | 构建自动化 AI Agent（自动投放广告、自动支付、自动发邮件），需防止 Agent 失控造成财务损失 |
| 小型技术团队 | 运行多个 AI Agent 处理业务流程，需要统一的 API 调用监控与管控 |
| AI 应用开发者 | 在开发和测试阶段需要对 Agent 行为进行沙箱式限制 |

## 1.3 用户痛点（按优先级）

1. Agent 调用支付 API（Stripe、PayPal）出现循环扣款或金额异常，造成真实财务损失
2. Agent 调用广告投放 API（Google Ads、Meta Ads）失控，单日烧掉大量预算
3. Agent 调用第三方 API 频率过高，触发封号或产生高额账单
4. 无法事后审计 Agent 做了哪些 API 调用，出问题无从排查
5. 没有紧急停止机制，发现问题时已造成损失

## 1.4 产品边界（明确不做的事）

- 不处理支付清算，不存储银行卡或账户凭证
- 不是 API Gateway 的替代品（不做负载均衡、服务发现）
- MVP 阶段不做多租户 SaaS
- 不做 AI 模型本身的安全（Prompt Injection 防护不在范围内）
- 不做网络层防火墙

---

# 二、原始设计缺陷分析

对比原始 ag.md，系统梳理存在的设计空白和架构问题。

## 2.1 架构层面

**问题 1：代理模式未定义**

原始设计只提到 `http://localhost:8080/proxy/stripe`，但没有说明是路径映射模式、完整 URL 转发模式还是 HTTP CONNECT 隧道模式。三种模式对 Agent 的接入成本差异极大。

**问题 2：HTTPS/TLS 终止未设计**

绝大多数目标 API 都是 HTTPS，原始设计未说明代理如何处理 HTTPS 上游连接，以及 Agent 到 AgentGuard 之间是否需要加密。

**问题 3：流式响应未考虑**

OpenAI、Anthropic 等 AI API 大量使用 SSE 流式响应。代理层必须支持流式透传，否则会导致超时或响应被截断。

**问题 4：Agent 身份识别完全缺失**

原始设计中没有任何 Agent 身份的概念，所有请求被当作同一来源处理，无法区分来源、设置差异化规则、或针对单个 Agent 触发 Kill Switch。

## 2.2 安全层面

**问题 5：Dashboard 本身没有访问控制**

Dashboard 可以查看所有日志、修改所有规则、触发 Kill Switch，但原始设计没有任何认证机制。

**问题 6：代理端点没有访问控制**

任何能访问 localhost:8080 的进程都可以通过代理发起 API 调用。

**问题 7：API Key 存储和传递机制未设计**

原始设计提到"API Key 加密存储"，但没有说明 Key 存在哪里、如何传递、如何验证。

## 2.3 功能层面

**问题 8：告警机制完全缺失**

Pro 版本提到"邮件提醒"，但没有设计触发条件、渠道配置、告警界面。

**问题 9：配置持久化未设计**

原始 SQLite 表结构只有 transactions，没有 rules 或 config 表，重启后规则丢失。

**问题 10：审计日志不完整**

缺少响应状态码、响应时间、规则匹配详情、日志导出功能。

## 2.4 商业层面

**问题 11：本地授权机制未设计**

Pro 版本 $19/月，但本地运行的软件如何验证授权？没有设计 License Key 的生成、验证、离线宽限期机制。

---

# 三、产品架构设计（优化版）

## 3.1 代理模式选择

**MVP 采用路径映射代理（模式 A）**，v1.1 支持 HTTP CONNECT 透明代理（模式 B）。

**模式 A：路径映射代理（MVP）**

Agent 将目标 API 的 base URL 替换为 AgentGuard 端点，使用预注册的服务别名：

```
原始调用: POST https://api.stripe.com/v1/charges
代理调用: POST http://localhost:8080/proxy/stripe/v1/charges
```

Agent 只需修改 base URL，其余代码不变。

**模式 B：HTTP CONNECT 透明代理（v1.1）**

Agent 设置系统代理环境变量，代码完全不需要修改：

```
HTTP_PROXY=http://localhost:8080
HTTPS_PROXY=http://localhost:8080
```

## 3.2 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                    AgentGuard System                     │
│                                                         │
│  ┌──────────────┐         ┌──────────────────────────┐  │
│  │  Dashboard   │◄───────►│   Management API         │  │
│  │  (Next.js)   │  REST   │   Port 3000              │  │
│  │  Port 3001   │         │   Auth / Config / Logs   │  │
│  └──────────────┘         └──────────┬───────────────┘  │
│                                      │                   │
│  ┌───────────────────────────────────▼───────────────┐  │
│  │              AgentGuard Core Engine                │  │
│  │                                                   │  │
│  │  Agent Auth  │  Rule Engine  │  Budget Manager    │  │
│  │  Rate Limiter│  Risk Detector│  Kill Switch       │  │
│  │  Alert Manager              │  Audit Logger       │  │
│  └───────────────────────────────────────────────────┘  │
│                              │                           │
│  ┌───────────────────────────▼───────────────────────┐  │
│  │              Proxy Layer (Port 8080)               │  │
│  │   HTTP/HTTPS 转发 │ 流式响应透传 │ Agent Token 验证 │  │
│  └───────────────────────────┬───────────────────────┘  │
│                              │                           │
│  ┌───────────────────────────▼───────────────────────┐  │
│  │              Storage Layer                         │  │
│  │   SQLite: 12张表（规则/日志/Agent/告警等）          │  │
│  │   In-memory: 限流计数器 / Kill Switch 状态          │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │      External APIs        │
              │  Stripe / OpenAI / Ads    │
              └───────────────────────────┘
```

## 3.3 请求处理流水线

每个进入代理的请求按以下顺序处理：

```
请求进入
  [1] Agent Token 验证          → 失败: 401 Unauthorized
  [2] IP 白名单检查              → 失败: 403 Forbidden
  [3] Kill Switch 检查           → 全局暂停: 503 / Agent 暂停: 503
  [4] 目标 URL 解析 + 白名单检查  → 非白名单域名: 403
  [5] 请求体解析（提取金额字段）
  [6] Rule Engine 评估           → 单笔超限: 403 / 日预算超限: 403
  [7] Rate Limiter 检查          → 频率超限: 429
  [8] Risk Detector 评估         → 高风险: 403（可配置为仅告警）
  [9] 审计日志记录（请求阶段）
  [10] 转发到目标 API（支持流式透传）
  [11] 响应处理（解析实际金额）
  [12] Budget Manager 更新
  [13] 审计日志记录（响应阶段）+ 告警检查
返回响应给 Agent
```

**关键原则：fail-closed**。当 AgentGuard 内部出现异常时，默认拒绝请求而不是放行。


---

# 四、核心模块详细需求

## 4.1 Agent 身份与认证模块（新增）

### Token 机制

每个 Agent 在 Dashboard 注册后获得一个 Agent Token，格式：

```
ag_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Agent 在请求时通过 Header 传递：

```
X-AgentGuard-Token: ag_live_xxxxxxxx...
```

### Agent 数据模型

```typescript
interface Agent {
  id: string;              // UUID
  name: string;            // 用户自定义名称，如 "stripe-payment-bot"
  token: string;           // ag_live_xxx，SHA-256 哈希存储
  status: "active" | "paused" | "revoked";
  ruleSetId: string;       // 关联的规则集 ID
  createdAt: Date;
  lastSeenAt: Date;
  description?: string;
}
```

### 版本限制

- Free：最多 1 个 Agent Token
- Pro：最多 10 个 Agent Token

### 无 Token 降级行为

若请求未携带 Token，且系统中只有一个 Agent 配置，则自动使用该默认 Agent 的规则（降低 Free 版接入门槛）。若有多个 Agent 配置，则拒绝无 Token 请求。

---

## 4.2 Proxy Layer（增强版）

### 功能需求

- 支持 GET、POST、PUT、PATCH、DELETE 方法
- 服务别名路由（内置：stripe / openai / anthropic / google-ads）
- 请求体完整透传（JSON、form-data、multipart）
- 流式响应透传（SSE、chunked transfer encoding）
- 保留 Agent 原始请求头（Authorization 等）
- 上游 SSL 证书验证（默认开启，可配置关闭用于测试）
- 上游超时默认 30 秒，可配置

### 服务别名注册

用户在 Dashboard 注册别名，简化 Agent 接入：

| 别名 | 目标 Base URL |
|------|--------------|
| stripe | https://api.stripe.com |
| openai | https://api.openai.com |
| anthropic | https://api.anthropic.com |
| google-ads | https://googleads.googleapis.com |

Agent 调用：`POST http://localhost:8080/proxy/stripe/v1/charges`
实际转发：`POST https://api.stripe.com/v1/charges`

### 流式响应处理策略

流式请求（如 OpenAI Chat Completion）在响应完成前无法知道实际 token 消耗。MVP 采用"请求时预扣，响应后修正"策略：
- 请求时根据 `max_tokens` 参数预扣预算
- 流结束后根据实际 `usage` 字段修正

### 错误处理

| 场景 | 行为 |
|------|------|
| 上游 API 超时 | 返回 504，记录日志，不计入预算 |
| 上游 API 5xx | 透传响应，记录日志，不计入预算 |
| 上游 API 4xx | 透传响应，记录日志，不计入预算 |
| AgentGuard 内部错误 | 返回 502，记录错误日志 |
| 规则引擎崩溃 | 默认拒绝（fail-closed），记录告警 |

---

## 4.3 Rule Engine（增强版）

### 规则数据模型

```typescript
interface Rule {
  id: string;
  ruleSetId: string;
  type: RuleType;
  enabled: boolean;
  action: "block" | "alert" | "alert_and_block";
  priority: number;        // 数字越小优先级越高
  params: Record<string, any>;
}

type RuleType =
  | "daily_budget"          // 每日总预算上限
  | "per_call_limit"        // 单笔金额上限
  | "monthly_budget"        // 月度预算上限（Pro）
  | "rate_limit_per_minute" // 每分钟调用次数
  | "rate_limit_per_hour"   // 每小时调用次数
  | "domain_whitelist"      // 域名白名单
  | "domain_blacklist"      // 域名黑名单
  | "method_restriction"    // HTTP 方法限制
  | "time_window_block"     // 时间段封锁
  | "consecutive_failure"   // 连续失败次数告警
  | "amount_spike"          // 金额突增检测
```

### 规则优先级（从高到低）

1. Kill Switch（全局 / Agent 级）
2. 域名黑名单
3. HTTP 方法限制
4. 单笔金额上限
5. 每日 / 月度预算上限
6. 频率限制
7. 域名白名单（不在白名单则拒绝）
8. 风险检测规则

### 配置持久化

规则存储在 SQLite 的 `rule_sets` 和 `rules` 表中，服务启动时加载到内存，修改时同步写入数据库并热更新内存缓存。

---

## 4.4 Budget Manager（增强版）

### 数据库表结构

```sql
-- 交易记录表（核心审计日志）
transactions (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  timestamp DATETIME,
  method TEXT,
  target_url TEXT,
  target_service TEXT,
  amount REAL,
  currency TEXT,
  decision TEXT,           -- "allow" | "block" | "error"
  block_reason TEXT,
  rule_id TEXT,
  response_status INTEGER,
  latency_ms REAL,
  is_streaming BOOLEAN
)

-- 预算快照表（按小时聚合，快速查询）
budget_snapshots (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  snapshot_hour DATETIME,  -- 精确到小时
  total_calls INTEGER,
  allowed_calls INTEGER,
  blocked_calls INTEGER,
  total_cost REAL
)
```

### 金额提取策略

不同 API 的金额字段位置不同，内置提取规则：

| 服务 | 路径 | 字段 | 处理 |
|------|------|------|------|
| Stripe `/v1/charges` | 请求体 | `$.amount` | 除以 100（分→元） |
| Stripe `/v1/payment_intents` | 请求体 | `$.amount` | 除以 100 |
| OpenAI `/v1/chat/completions` | 响应体 | `$.usage.total_tokens` | 按模型单价估算 |

---

## 4.5 Rate Limiter（增强版）

### 实现策略

MVP 使用内存滑动窗口计数器，重启后重置（可接受）。

```typescript
interface RateLimitWindow {
  agentId: string;
  service?: string;
  windowType: "per_minute" | "per_hour" | "per_day";
  maxRequests: number;
  currentCount: number;
  windowStart: Date;
}
```

### 限流响应

触发限流时返回标准 HTTP 429，并在响应头中告知重置时间：

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1708531200
Retry-After: 3600
```

---

## 4.6 Risk Detector（增强版）

### MVP 风险规则（6条）

| 规则名称 | 触发条件 | 默认动作 |
|---------|---------|---------|
| 金额突增 | 单笔金额超过过去 7 天平均值的 5 倍 | 告警 + 阻断 |
| 高频异常 | 1 分钟内调用次数超过正常值 10 倍 | 告警 + 阻断 |
| 未知域名 | 访问未在白名单或别名中注册的域名 | 告警（可配置为阻断） |
| 深夜大额 | 凌晨 0-6 点发生超过阈值的支付 | 告警 |
| 连续失败 | 同一 Agent 连续 5 次请求被阻断 | 告警 + 自动暂停 Agent |
| 响应异常 | 上游返回 402/403 超过 3 次 | 告警 |

### v1.1 预留接口

```typescript
interface RiskAssessment {
  score: number;           // 0-100，越高越危险
  level: "low" | "medium" | "high" | "critical";
  factors: RiskFactor[];
  recommendation: "allow" | "alert" | "block";
}
```

---

## 4.7 Kill Switch（增强版）

### 两级 Kill Switch

```typescript
interface KillSwitchState {
  global: {
    paused: boolean;
    pausedAt?: Date;
    pausedBy: "user" | "auto_risk" | "budget_exceeded";
    reason?: string;
  };
  agents: {
    [agentId: string]: {
      paused: boolean;
      pausedAt?: Date;
      pausedBy: "user" | "auto_risk" | "consecutive_failure";
    }
  }
}
```

### 自动触发条件

- 全局 Kill Switch：月度预算超过 95%（阈值可配置）
- Agent Kill Switch：连续 5 次被风险检测阻断

### 恢复机制

- 必须人工在 Dashboard 确认恢复，不支持自动恢复
- 恢复时需要二次确认（防止误操作）

---

## 4.8 Alert Manager（新增模块）

### 告警事件类型

```typescript
enum AlertEventType {
  BUDGET_WARNING        = "budget.warning",        // 预算达到阈值（80%）
  BUDGET_EXCEEDED       = "budget.exceeded",        // 预算超限
  RATE_LIMIT_TRIGGERED  = "rate.limit.triggered",   // 频率限制触发
  RISK_ANOMALY_DETECTED = "risk.anomaly.detected",  // 异常行为检测
  RISK_UNKNOWN_DOMAIN   = "risk.unknown.domain",    // 访问未知域名
  RISK_AMOUNT_SPIKE     = "risk.amount.spike",      // 金额突增
  KILL_SWITCH_ACTIVATED = "system.kill_switch.on",  // Kill Switch 激活
  KILL_SWITCH_RELEASED  = "system.kill_switch.off", // Kill Switch 解除
  AGENT_AUTO_PAUSED     = "agent.auto_paused",      // Agent 自动暂停
  PROXY_ERROR           = "proxy.error",            // 代理转发错误
}
```

### 告警渠道

**渠道一：本地系统通知（Free + Pro）**

使用 `node-notifier` 调用操作系统原生通知（macOS / Windows / Linux），点击通知可跳转到 Dashboard 对应页面。

**渠道二：Webhook（Free + Pro）**

向用户配置的 HTTP 端点发送 POST 请求，支持 HMAC-SHA256 签名验证。内置模板：Slack / Discord / 企业微信 / 飞书。

```json
{
  "event": "budget.exceeded",
  "severity": "critical",
  "agent_id": "agent_abc123",
  "message": "Agent [my-agent] 今日花费 $52.30，已超过限额 $50.00",
  "timestamp": "2026-02-21T10:30:00Z"
}
```

**渠道三：邮件（Pro 专属）**

SMTP 配置，支持即时发送和汇总模式（按配置间隔汇总多条告警）。

### 告警去重

相同类型 + 相同 Agent 在 300 秒窗口内只发送一次，防止告警风暴。

---

## 4.9 Audit Logger（新增模块）

### 三类日志

**请求日志**：记录每一条经过代理的 HTTP 请求，包含 Agent 信息、目标 URL（脱敏）、决策结果、延迟、费用。不记录请求体原文，防止敏感数据泄露。

**配置变更日志**：记录所有通过 Dashboard 或 API 进行的配置修改，包含变更前后的 JSON 快照和操作者信息。

**系统事件日志**：记录 AgentGuard 自身的运行状态事件（启动/停止/Kill Switch/错误）。

### 写入策略

批量写入：队列满 500 条或等待 2 秒，任一条件满足即触发写入 SQLite 事务。

### 日志保留

| 版本 | 请求日志 | 配置变更日志 | 系统事件日志 |
|------|----------|--------------|--------------|
| Free | 7 天 | 30 天 | 30 天 |
| Pro | 90 天 | 永久 | 90 天 |

### 完整性保护

每条配置变更日志写入时计算 `SHA-256(timestamp + action + resource_id + before + after)` 作为 checksum，支持通过 `agentguard verify-logs` 命令验证日志链完整性。

### 导出格式

支持 JSON Lines（`.jsonl`）和 CSV，支持按时间范围、Agent、决策结果过滤。

// __CONTINUE_HERE__

