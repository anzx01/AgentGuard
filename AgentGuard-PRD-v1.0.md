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


---

# 五、Dashboard 设计

## 5.1 总体布局

```
┌─────────────────────────────────────────────────────────┐
│  AgentGuard v1.0  [● 运行中]        [■ Kill Switch] [⚙] │  ← 顶部导航栏
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ ○ 总览   │              主内容区                         │
│ ○ Agent  │                                              │
│ ○ 规则   │                                              │
│ ○ 日志   │                                              │
│ ○ 告警 3 │                                              │
│ ○ 设置   │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

- 顶部导航栏：Logo + 版本号 / 系统状态灯（绿=运行 / 红=暂停 / 黄=警告）/ 全局 Kill Switch 按钮（红色，点击需二次确认）
- 侧边栏：固定宽度 220px，"告警"菜单项显示未读数量角标
- 主内容区：随路由切换

---

## 5.2 总览页（/）

### 顶部统计卡片（4个）

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  今日花费     │ │  本月花费     │ │  今日请求数   │ │  今日阻断数  │
│  $12.50      │ │  $89.30      │ │  1,234       │ │  7           │
│  ↑23% vs昨日 │ │  ████░ 44%  │ │  ↓5% vs昨日  │ │  ↑2 vs昨日   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### 花费趋势图

- 折线图（Recharts），时间范围切换：今日（按小时）/ 近 7 天 / 近 30 天
- 双轴：花费金额（左轴）+ 请求次数（右轴）

### Agent 状态列表

| Agent 名称 | 状态 | 今日花费 | 今日请求 | 操作 |
|-----------|------|---------|---------|------|
| my-agent | ● 活跃 | $8.20 | 892 | [暂停][详情] |
| test-bot | ○ 空闲 | $4.30 | 342 | [暂停][详情] |
| scraper | ⊗ 已阻断 | $0.00 | 0 | [恢复][详情] |

### 最近告警（5条）

显示最近 5 条未确认告警，每条含严重级别图标、标题、时间、"查看"链接。

### 实时请求流

通过 WebSocket 实时推送，显示最新 20 条请求，新请求以动画方式插入顶部。

---

## 5.3 Agent 管理页（/agents）

### Agent 卡片列表

```
┌─────────────────────────────────────────────────────┐
│ my-agent                                  ● 活跃    │
│ 今日: $8.20 / $50.00 限额                           │
│ [████████░░] 16.4%                                  │
│ Token: ag_live_xxxx...xxxx  [复制] [重置]            │
│                             [编辑规则] [暂停] [删除] │
└─────────────────────────────────────────────────────┘
```

### 新建/编辑 Agent 表单（侧边抽屉）

```
基本信息
  Agent 名称 *    [my-agent          ]
  描述            [用于电商数据采集   ]

目标服务白名单
  ☑ stripe   ☑ openai   ☐ twilio
  [+ 添加自定义服务]

预算规则
  每日预算上限    [$ 50.00]
  每月预算上限    [$ 500.00]
  单笔金额上限    [$ 5.00]
  预算告警阈值    [80]%

频率规则
  每分钟最大请求  [10]
  每小时最大请求  [200]

超限行为
  预算超限时：  ○ 阻断请求  ● 告警但放行
  频率超限时：  ● 阻断请求  ○ 告警但放行

                              [取消] [保存]
```

### Agent 详情页（/agents/:id）

包含：基本信息 / 今日花费统计 / 花费趋势图 / 规则列表（可直接编辑）/ 最近请求记录（50条，可翻页）/ 告警历史

---

## 5.4 规则配置页（/rules）

### 全局默认规则

```
规则类型          当前值        状态      操作
─────────────────────────────────────────────────
每日预算上限      $100.00       ● 启用    [编辑] [禁用]
单笔金额上限      $10.00        ● 启用    [编辑] [禁用]
每分钟请求上限    20 次         ● 启用    [编辑] [禁用]
未知域名访问      阻断          ● 启用    [编辑] [禁用]
                                         [+ 添加全局规则]
```

点击"编辑"后该行变为内联编辑状态，保存后热更新生效。

### 服务别名配置

```
别名          目标 URL                    操作
─────────────────────────────────────────────────
stripe        https://api.stripe.com      [编辑] [删除]
openai        https://api.openai.com      [编辑] [删除]
anthropic     https://api.anthropic.com   [编辑] [删除]
                                          [+ 添加别名]
```

---

## 5.5 实时日志页（/logs）

### 过滤栏

```
[全部 Agent ▼] [全部服务 ▼] [全部状态 ▼] [时间范围 ▼]
搜索 URL 或 Agent...                [● 实时] [导出]
```

### 日志列表

```
时间              Agent      服务      方法  状态   延迟   费用
──────────────────────────────────────────────────────────────
10:30:01.234     my-agent   stripe    POST  ✓通过  234ms  $2.50
10:30:00.891     my-agent   openai    POST  ✓通过  1.2s   $0.03
10:29:58.123     test-bot   stripe    POST  ✗阻断  12ms   -
```

颜色编码：通过=绿色 / 阻断=红色+浅红背景 / 错误=橙色

实时模式：WebSocket 推送，新日志黄色高亮闪烁 1 秒。

### 日志详情抽屉（右侧滑出，480px）

```
请求详情
  事务 ID      txn_01HQ...
  时间         2026-02-21 10:30:01.234
  Agent        my-agent
  目标服务     stripe
  目标 URL     https://api.stripe.com/v1/charges
  方法         POST
  响应状态     200 OK
  延迟         234ms
  预估费用     $2.50

决策信息
  决策         ✓ 通过
  触发规则     -

请求头（脱敏）
  Authorization: Bearer sk-***...***
```

---

## 5.6 告警中心页（/alerts）

### 顶部统计卡片（4个）

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ CRITICAL │ │  HIGH    │ │  MEDIUM  │ │  待处理  │
│    2     │ │    5     │ │   12     │ │    8     │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### 过滤栏

```
[严重度 ▼] [类型 ▼] [Agent ▼] [时间范围 ▼] [● 仅未处理]
```

### 告警列表

```
● CRITICAL  [预算超限]                          2分钟前  [确认]
  trading-bot 今日花费 $9.87 已超过限额 $10.00

● HIGH      [频率异常]                         15分钟前  [确认]
  data-scraper 10分钟内调用 OpenAI 47次，超过阈值 20次

✓ MEDIUM    [未知域名]              已确认  1小时前  [已处理]
  research-agent 尝试访问 unknown-api.xyz
```

支持批量确认/忽略操作。

---

## 5.7 设置页（/settings）

左侧导航 + 右侧内容两栏布局，导航项：安全认证 / 代理配置 / 数据管理 / 通知渠道 / 授权与版本 / 危险操作。

### 安全认证

- Dashboard 访问密码（bcrypt 存储）
- 会话超时时间（15分钟 / 30分钟 / 1小时 / 8小时 / 永不）

### 代理配置

- 代理监听端口（默认 8080）
- 管理 API 端口（默认 3000）
- 绑定地址（127.0.0.1 推荐 / 0.0.0.0 局域网）
- IP 白名单（每行一个，留空不限制）

### 数据管理

- 日志保留策略（按类型分别配置）
- 数据库状态（文件大小、记录数）
- 立即清理过期数据 / 导出数据库备份
- 自动备份配置（频率 / 保留数量 / 路径）

### 授权与版本

- 当前版本信息
- 当前套餐（Free / Pro）
- License Key 输入框 + 激活按钮
- Pro 激活后显示：授权邮箱 / 到期时间 / 上次验证时间

### 危险操作

- 重置所有规则（不影响日志）
- 清空所有日志（不影响规则）
- 重置系统（恢复出厂，需输入密码确认）


---

# 六、安全设计

## 6.1 Dashboard 认证

**认证机制**：本地密码 + JWT Session Token，无需外部认证服务。

```
登录流程：
  POST /api/auth/login { password }
  → bcrypt.compare(password, storedHash)
  → 验证通过 → 生成 JWT (HS256, 24h 有效期)
  → 返回 { token, expiresAt }
  → 前端存入 httpOnly Cookie
  → 后续请求携带 Authorization: Bearer <token>
```

**密码存储**：`bcrypt.hash(password, saltRounds=12)`，存入 settings 表。

**首次启动**：若未设置密码，Dashboard 显示初始化向导，强制设置密码后才能使用。

**暴力破解防护**：同一 IP 5 次失败后锁定 15 分钟，记录到 system_events 表。

**JWT Secret**：从环境变量 `JWT_SECRET` 读取，若未设置则随机生成并持久化到 settings 表。

## 6.2 代理端点访问控制

**Agent Token 验证**：

```
Token 格式：ag_<agentId>_<32位随机hex>
存储：SHA-256 哈希后存入 agent_tokens 表
验证：SHA-256(请求中的token) 与数据库比对
```

**IP 白名单**：settings 表存储 `proxy_ip_allowlist`（JSON 数组），空数组表示不限制。

**双重验证流程**：

```
代理请求到达
  → 检查来源 IP 是否在白名单（若启用）
  → 检查 X-AgentGuard-Token 是否有效
  → 检查对应 Agent 是否处于 active 状态
  → 通过后进入规则引擎
```

## 6.3 敏感数据加密

| 数据类型 | 存储方式 |
|---------|---------|
| Agent Token 原文 | 仅在创建时返回一次，之后不存储原文 |
| Agent Token 校验值 | SHA-256 哈希存储 |
| SMTP 密码 | AES-256-GCM 加密存储 |
| Webhook Secret | AES-256-GCM 加密存储 |
| License Key | AES-256-GCM 加密存储 |

**加密密钥来源**：环境变量 `ENCRYPTION_KEY`（32字节hex），若未设置则启动时随机生成并持久化到 settings 表。

**展示层脱敏规则**：日志中 `Authorization` header 值替换为 `Bearer sk-***...***`，`api_key`、`password`、`secret` 字段值替换为 `***`。

## 6.4 审计日志完整性

每条配置变更日志写入时计算：

```
checksum = SHA-256(timestamp + action + resource_id + before_value + after_value)
```

提供 `GET /api/audit/verify` 接口，重新计算所有审计记录的 checksum 并比对，检测是否有记录被篡改。

## 6.5 本地部署安全建议

**网络隔离（推荐配置）**：

```
代理端口 8080 → 仅绑定 127.0.0.1
管理 API 3000 → 仅绑定 127.0.0.1
Dashboard 3001 → 仅绑定 127.0.0.1
```

**Docker 安全配置**：

```yaml
services:
  agentguard:
    user: "1000:1000"              # 非 root 运行
    cap_drop: [ALL]                # 丢弃所有 Linux capabilities
    security_opt:
      - no-new-privileges:true
    ports:
      - "127.0.0.1:8080:8080"     # 仅本机暴露
      - "127.0.0.1:3000:3000"
    restart: unless-stopped
```

---

# 七、完整数据库 Schema（SQLite）

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- agents：注册的 Agent 实例
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK(status IN ('active','paused','blocked')),
  rule_set_id   TEXT,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  last_seen_at  DATETIME
);

-- agent_tokens：Agent 访问代理的认证 Token
CREATE TABLE IF NOT EXISTS agent_tokens (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,   -- SHA-256(原始token)
  token_prefix  TEXT NOT NULL,          -- 原始token前8位，用于展示
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  last_used_at  DATETIME,
  expires_at    DATETIME                -- NULL 表示永不过期
);

-- rule_sets：规则集
CREATE TABLE IF NOT EXISTS rule_sets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  is_default    INTEGER NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- rules：具体规则条目
CREATE TABLE IF NOT EXISTS rules (
  id            TEXT PRIMARY KEY,
  rule_set_id   TEXT NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK(type IN (
                  'daily_budget','monthly_budget','per_call_limit',
                  'rate_limit','domain_whitelist','domain_blacklist',
                  'method_restriction','time_window_block',
                  'consecutive_failure','amount_spike'
                )),
  is_enabled    INTEGER NOT NULL DEFAULT 1,
  action        TEXT NOT NULL DEFAULT 'block'
                CHECK(action IN ('block','alert','alert_and_block')),
  priority      INTEGER NOT NULL DEFAULT 100,
  params        TEXT NOT NULL DEFAULT '{}',  -- JSON 规则参数
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- transactions：每次代理请求的完整记录
CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
  timestamp       DATETIME NOT NULL DEFAULT (datetime('now')),
  method          TEXT NOT NULL,
  target_url      TEXT NOT NULL,
  target_service  TEXT,
  request_headers TEXT,           -- JSON，敏感字段已脱敏
  request_size    INTEGER,
  decision        TEXT NOT NULL CHECK(decision IN ('allow','block','error')),
  blocked_rule_id TEXT REFERENCES rules(id) ON DELETE SET NULL,
  block_reason    TEXT,
  response_status INTEGER,
  response_size   INTEGER,
  latency_ms      REAL,
  proxy_latency_ms REAL,
  estimated_cost  REAL DEFAULT 0,
  actual_cost     REAL,
  ip_address      TEXT,
  is_streaming    INTEGER DEFAULT 0
);

CREATE INDEX idx_transactions_agent_id ON transactions(agent_id);
CREATE INDEX idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX idx_transactions_decision ON transactions(decision);

-- budget_snapshots：预算快照（按小时聚合）
CREATE TABLE IF NOT EXISTS budget_snapshots (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT REFERENCES agents(id) ON DELETE CASCADE,
  snapshot_hour   DATETIME NOT NULL,
  total_calls     INTEGER NOT NULL DEFAULT 0,
  allowed_calls   INTEGER NOT NULL DEFAULT 0,
  blocked_calls   INTEGER NOT NULL DEFAULT 0,
  total_cost      REAL NOT NULL DEFAULT 0,
  UNIQUE(agent_id, snapshot_hour)
);

-- alert_events：告警事件
CREATE TABLE IF NOT EXISTS alert_events (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
  transaction_id  TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  severity        TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low','info')),
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  details         TEXT,           -- JSON 附加上下文
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK(status IN ('open','acknowledged','resolved','ignored')),
  acknowledged_at DATETIME,
  ack_note        TEXT,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_alert_events_status ON alert_events(status);
CREATE INDEX idx_alert_events_created_at ON alert_events(created_at);

-- alert_channels：告警通知渠道配置
CREATE TABLE IF NOT EXISTS alert_channels (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('local_notification','email','webhook')),
  is_enabled      INTEGER NOT NULL DEFAULT 1,
  config          TEXT NOT NULL DEFAULT '{}',  -- JSON，敏感字段 AES-256 加密
  min_severity    TEXT NOT NULL DEFAULT 'high',
  alert_types     TEXT NOT NULL DEFAULT '[]',  -- JSON 数组，空=全部
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- config_change_logs：配置变更审计日志
CREATE TABLE IF NOT EXISTS config_change_logs (
  id              TEXT PRIMARY KEY,
  operator        TEXT NOT NULL DEFAULT 'admin',
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  before_value    TEXT,           -- JSON 快照
  after_value     TEXT,           -- JSON 快照
  ip_address      TEXT,
  checksum        TEXT NOT NULL,  -- SHA-256 完整性校验
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- system_events：系统级事件
CREATE TABLE IF NOT EXISTS system_events (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'info',
  message         TEXT NOT NULL,
  details         TEXT,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- settings：系统配置键值对
CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  value           TEXT,
  is_encrypted    INTEGER NOT NULL DEFAULT 0,
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- service_aliases：服务别名映射
CREATE TABLE IF NOT EXISTS service_aliases (
  id              TEXT PRIMARY KEY,
  alias           TEXT NOT NULL UNIQUE,
  target_url      TEXT NOT NULL,
  description     TEXT,
  is_builtin      INTEGER NOT NULL DEFAULT 0,
  is_enabled      INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- 预置内置别名
INSERT OR IGNORE INTO service_aliases (id, alias, target_url, description, is_builtin) VALUES
  ('builtin-stripe',    'stripe',    'https://api.stripe.com',             'Stripe 支付 API',    1),
  ('builtin-openai',    'openai',    'https://api.openai.com',             'OpenAI API',         1),
  ('builtin-anthropic', 'anthropic', 'https://api.anthropic.com',          'Anthropic Claude',   1),
  ('builtin-gads',      'google-ads','https://googleads.googleapis.com',   'Google Ads API',     1);

-- 预置默认配置
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('proxy_port',              '8080'),
  ('api_port',                '3000'),
  ('bind_address',            '127.0.0.1'),
  ('proxy_ip_allowlist',      '[]'),
  ('session_timeout_minutes', '30'),
  ('log_retention_days',      '7'),
  ('alert_retention_days',    '180'),
  ('auto_backup_enabled',     '1'),
  ('kill_switch_active',      '0'),
  ('license_tier',            'free'),
  ('setup_completed',         '0');
```


---

# 八、管理 REST API 设计

所有接口（除登录外）需携带 `Authorization: Bearer <jwt>` 请求头。

## 认证

```
POST /api/auth/login
请求: { "password": "your-password" }
响应: { "token": "eyJ...", "expiresAt": "2026-02-22T10:00:00Z" }

POST /api/auth/logout
响应: { "message": "已退出" }
```

## Agent 管理

```
GET    /api/agents                    # 获取所有 Agent 列表
POST   /api/agents                    # 创建新 Agent
GET    /api/agents/:id                # 获取 Agent 详情
PUT    /api/agents/:id                # 更新 Agent 信息
DELETE /api/agents/:id                # 删除 Agent
POST   /api/agents/:id/pause          # 暂停 Agent
POST   /api/agents/:id/resume         # 恢复 Agent
POST   /api/agents/:id/rotate-token   # 重置 Agent Token
```

创建 Agent 响应示例：

```json
{
  "id": "agent_01HQ...",
  "name": "my-agent",
  "token": "ag_live_a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5",
  "note": "Token 仅显示一次，请立即保存"
}
```

## 规则管理

```
GET    /api/rule-sets                 # 获取所有规则集
GET    /api/rule-sets/:id/rules       # 获取规则集下的规则
POST   /api/rule-sets/:id/rules       # 创建规则
PUT    /api/rules/:id                 # 更新规则
DELETE /api/rules/:id                 # 删除规则
```

## 日志查询

```
GET /api/logs?page=1&pageSize=50&agentId=&status=&service=&from=&to=&q=
```

响应：

```json
{
  "total": 1240,
  "page": 1,
  "pageSize": 50,
  "data": [
    {
      "id": "txn_01HQ...",
      "timestamp": "2026-02-21T09:30:00Z",
      "agentId": "agent_01HQ...",
      "agentName": "my-agent",
      "service": "stripe",
      "method": "POST",
      "targetUrl": "https://api.stripe.com/v1/charges",
      "decision": "block",
      "blockReason": "daily_budget_exceeded",
      "latencyMs": 3,
      "estimatedCost": 0
    }
  ]
}
```

## 预算统计

```
GET /api/budget/summary
```

响应：

```json
{
  "today": { "spend": 45.20, "limit": 100.00, "percentage": 45.2 },
  "month": { "spend": 312.00, "limit": 1000.00, "percentage": 31.2 },
  "byAgent": [
    { "agentId": "agent_01HQ...", "name": "my-agent", "todaySpend": 12.50 }
  ]
}
```

## 告警管理

```
GET  /api/alerts?status=open&severity=&page=1&pageSize=20
POST /api/alerts/:id/acknowledge      # 确认告警，body: { "note": "已处理" }
POST /api/alerts/batch-acknowledge    # 批量确认，body: { "ids": [...] }
```

## 告警渠道

```
GET    /api/alert-channels
POST   /api/alert-channels
PUT    /api/alert-channels/:id
DELETE /api/alert-channels/:id
POST   /api/alert-channels/:id/test   # 发送测试通知
```

## 服务别名

```
GET    /api/service-aliases
POST   /api/service-aliases
PUT    /api/service-aliases/:id
DELETE /api/service-aliases/:id       # 内置别名不可删除
```

## Kill Switch

```
POST /api/kill-switch/activate
请求: { "reason": "检测到异常", "scope": "global" }
      scope: "global" | "agent"，agent 时需附加 agentId

POST /api/kill-switch/deactivate
请求: { "scope": "global" }

GET  /api/kill-switch/status
响应: { "global": { "paused": false }, "agents": { "agent_01HQ...": { "paused": true } } }
```

## 系统设置

```
GET /api/settings
PUT /api/settings          # 部分更新，body: { "proxy": { "port": 8080 } }
```

## 审计

```
GET /api/audit/config-changes?page=1&pageSize=50
GET /api/audit/verify                 # 验证日志链完整性
GET /api/audit/export?format=jsonl&from=&to=&agentId=
```

## WebSocket 实时事件

连接地址：`ws://localhost:3000/ws?token=<jwt>`

| 事件 | 触发时机 | 主要字段 |
|------|---------|---------|
| `new_request` | 每次代理请求完成 | agentId, service, decision, latencyMs, estimatedCost |
| `new_alert` | 新告警产生 | alert 完整对象 |
| `budget_update` | 预算数据变化 | agentId, todaySpend, percentage |
| `kill_switch_change` | Kill Switch 状态变化 | status, scope, reason |
| `agent_status_change` | Agent 暂停/恢复 | agentId, status |

---

# 九、MVP 功能范围（v1.0）

| 功能 | Free | Pro | v1.1 | 备注 |
|------|:----:|:---:|:----:|------|
| **核心代理** | | | | |
| HTTP 反向代理（路径映射模式） | ✓ | ✓ | ✓ | |
| 服务别名路由 | ✓ | ✓ | ✓ | 内置 4 个，可自定义 |
| HTTPS 上游转发 | ✓ | ✓ | ✓ | |
| 流式响应透传（SSE） | ✓ | ✓ | ✓ | |
| 透明 CONNECT 代理 | - | - | ✓ | 无需改 endpoint |
| **预算控制** | | | | |
| 单笔金额上限 | ✓ | ✓ | ✓ | |
| 每日总预算 | ✓ | ✓ | ✓ | |
| 每月总预算 | - | ✓ | ✓ | |
| 流式成本精确追踪 | - | - | ✓ | |
| **频率限制** | | | | |
| 每分钟 / 每小时调用上限 | ✓ | ✓ | ✓ | |
| 自定义时间窗口 | - | ✓ | ✓ | |
| **风险检测** | | | | |
| 金额突增检测 | ✓ | ✓ | ✓ | |
| 未知域名拦截 | ✓ | ✓ | ✓ | |
| 高频异常检测 | - | ✓ | ✓ | |
| 深夜大额告警 | - | ✓ | ✓ | |
| 行为评分模型 | - | - | v1.2 | |
| **Kill Switch** | | | | |
| 全局暂停 / 恢复 | ✓ | ✓ | ✓ | |
| 单 Agent 暂停 / 恢复 | ✓ | ✓ | ✓ | |
| 自动触发（预算超限） | - | ✓ | ✓ | |
| **Dashboard** | | | | |
| 实时监控总览 | ✓ | ✓ | ✓ | WebSocket |
| Agent 管理页 | ✓ | ✓ | ✓ | |
| 规则配置页 | ✓ | ✓ | ✓ | |
| 实时日志页 | ✓ | ✓ | ✓ | |
| 告警中心页 | ✓ | ✓ | ✓ | |
| 日志保留时长 | 7天 | 90天 | 90天 | |
| 移动端响应式 | - | - | ✓ | |
| **告警通知** | | | | |
| 本地桌面通知 | ✓ | ✓ | ✓ | node-notifier |
| Webhook 通知 | - | ✓ | ✓ | 含 Slack/Discord 模板 |
| 邮件通知（SMTP） | - | ✓ | ✓ | |
| **安全** | | | | |
| Dashboard 密码保护 | ✓ | ✓ | ✓ | bcrypt + JWT |
| Agent Token 认证 | ✓ | ✓ | ✓ | SHA-256 哈希存储 |
| 敏感数据 AES-256 加密 | ✓ | ✓ | ✓ | |
| 审计日志完整性校验 | - | ✓ | ✓ | SHA-256 链 |
| **部署** | | | | |
| Docker 单容器部署 | ✓ | ✓ | ✓ | |
| 最大 Agent 数量 | 1 | 10 | 10 | |
| 最大规则数量 | 5条 | 无限 | 无限 | |

---

# 十、商业模式

## 版本对比

| | Free | Pro |
|--|:----:|:---:|
| 价格 | 免费 | $19/月 |
| Agent 数量 | 1 | 10 |
| 规则数量 | 5条 | 无限 |
| 日志保留 | 7天 | 90天 |
| 告警渠道 | 本地通知 | 邮件 + Webhook |
| 风险检测 | 基础（4条规则） | 高级（6条规则） |
| 审计日志完整性 | - | ✓ |
| 技术支持 | 社区 | 邮件优先 |

## License Key 机制

**格式**：`AG-XXXX-XXXX-XXXX-XXXX`（20位字母数字，含连字符共24字符）

**激活流程**：

```
用户在 Dashboard 输入 License Key
  → POST https://license.agentguard.dev/v1/validate { key, machineId }
  → 返回 { valid: true, plan: "pro", email: "...", expiresAt: "..." }
  → 结果加密缓存到本地 SQLite settings 表
  → Pro 功能立即解锁
```

**后台验证**：每周一次静默在线验证，失败后进入宽限期。

**宽限期行为**：

| 状态 | Pro 功能 | 用户提示 |
|------|---------|---------|
| 验证正常 | 全部可用 | 无 |
| 宽限期内（1-14天） | 全部可用 | 顶部黄色警告横幅 |
| 宽限期满 | 降级为 Free 限制 | 弹窗提示，数据完整保留 |

**降级原则**：License 过期后数据不丢失，用户可随时重新激活恢复 Pro 功能。

---

# 十一、非功能性需求

## 性能

| 指标 | 目标 |
|------|------|
| 代理延迟 p50 | < 5ms（不含上游 API 耗时） |
| 代理延迟 p99 | < 15ms（不含上游 API 耗时） |
| 并发代理请求 | 100 个同时处理 |
| 启动时间 | < 3 秒（冷启动到可接受请求） |
| 内存基线 | < 150MB（空载运行） |

## 存储

- SQLite 启用 `PRAGMA journal_mode = WAL` 提升并发写入性能
- 启用 `auto_vacuum = INCREMENTAL`，定期执行 `VACUUM`
- 存储超过 1GB 时 Dashboard 显示警告
- 日志按保留策略每天凌晨 2:00 自动清理

## 可靠性

- 规则引擎出错时默认 **fail-closed**（拒绝请求，不放行）
- 代理转发超时默认 30 秒，可配置
- 进程崩溃后 Docker 自动重启（`restart: unless-stopped`）
- 审计日志写入失败不影响代理转发（异步写入）

## 可用性

- MVP 为单进程架构，不做高可用
- 无需负载均衡，无需集群
- 数据库文件支持手动备份和自动备份

---

# 十二、未来路线图

## v1.1（3个月后）

- **透明 CONNECT 代理**：Agent 通过设置 `HTTP_PROXY` 环境变量接入，无需修改任何代码
- **流式成本精确追踪**：实时统计 LLM token 消耗，流结束后精确更新预算
- **移动端友好 Dashboard**：响应式布局，支持手机查看监控和触发 Kill Switch

## v1.2（6个月后）

- **行为评分模型**：基于历史请求模式，对 Agent 行为打分（0-100），高分 Agent 自动放宽限制
- **Agent 信誉系统**：新 Agent 从低信任度开始，逐步建立信誉，信誉高的 Agent 享受更宽松的规则
- **高级异常检测**：时序分析，识别缓慢渗透式异常行为（如每天微量超支）

## v2.0（12个月后）

- **多用户团队管理**：角色权限（Owner / Admin / Viewer），支持多人协作管理
- **SaaS 云版本**：托管服务，无需自部署，数据云端存储
- **Plugin SDK**：开放自定义规则接口，支持社区插件生态（如自定义金额提取器、自定义风险规则）

## 长期愿景

- **多 Agent 编排安全**：监控 Agent 之间的相互调用链路，检测 Agent 协作中的异常
- **合规审计报告**：SOC2 就绪的结构化审计日志导出，支持一键生成合规报告
- **行业规则模板**：金融、医疗、广告等垂直场景预置规则包，开箱即用

---

*AgentGuard PRD v1.0 — 完*




