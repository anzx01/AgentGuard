产品代号：

> **AgentGuard**

---

# 🧠 一、产品目标

AgentGuard 是一个本地运行的 API 安全代理层，用于：

* 限制 Agent 的成本支出
* 检测异常调用行为
* 自动阻断风险操作
* 提供实时监控与 Kill Switch

不处理支付清算，不存储银行卡信息。

---

# 🏗 二、总体架构

<pre class="overflow-visible! px-0!" data-start="300" data-end="1148"><div class="w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-0 bottom-96"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-bg-elevated-secondary"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼ5 ͼj"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>                ┌────────────────────┐</span><br/><span>                │      Dashboard     │</span><br/><span>                │  (React / Next.js) │</span><br/><span>                └──────────┬─────────┘</span><br/><span>                           │ REST API</span><br/><span>                           ▼</span><br/><span>                ┌────────────────────┐</span><br/><span>                │   AgentGuard Core  │</span><br/><span>                │  (Node.js / TS)    │</span><br/><span>                ├────────────────────┤</span><br/><span>                │ Rule Engine        │</span><br/><span>                │ Budget Manager     │</span><br/><span>                │ Rate Limiter       │</span><br/><span>                │ Risk Detector      │</span><br/><span>                │ Kill Switch        │</span><br/><span>                └──────────┬─────────┘</span><br/><span>                           │ Proxy Forward</span><br/><span>                           ▼</span><br/><span>                ┌────────────────────┐</span><br/><span>                │ External APIs      │</span><br/><span>                │ Stripe / Ads / etc │</span><br/><span>                └────────────────────┘</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

---

# 🔧 三、技术栈

## Backend

* Node.js
* TypeScript
* Express / Fastify
* SQLite（本地 MVP）
* Redis（可选，做限流）

## Frontend

* Next.js
* Tailwind
* WebSocket 实时状态

## 部署

* Docker
* 本地运行
* 单机优先

---

# 📦 四、核心模块设计

---

## 1️⃣ Proxy Layer

### 功能

* 接收 Agent 的 HTTP 请求
* 解析目标 API
* 记录请求信息
* 交给 Rule Engine 判断
* 通过或阻断
* 转发到真实 API

### 示例代码逻辑

<pre class="overflow-visible! px-0!" data-start="1486" data-end="1738"><div class="w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-0 bottom-96"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-bg-elevated-secondary"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼ5 ͼj"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span class="ͼe">app</span><span class="ͼ8">.</span><span>post(</span><span class="ͼc">"/proxy/*"</span><span>, </span><span class="ͼ8">async</span><span> (</span><span class="ͼe">req</span><span>, </span><span class="ͼe">res</span><span>) => {</span><br/><span></span><span class="ͼ8">const</span><span></span><span class="ͼe">decision</span><span></span><span class="ͼ8">=</span><span></span><span class="ͼ8">await</span><span></span><span class="ͼe">guard</span><span class="ͼ8">.</span><span>evaluate(</span><span class="ͼe">req</span><span>)</span><br/><br/><span></span><span class="ͼ8">if</span><span> (</span><span class="ͼ8">!</span><span class="ͼe">decision</span><span class="ͼ8">.</span><span>allowed) {</span><br/><span></span><span class="ͼ8">return</span><span></span><span class="ͼe">res</span><span class="ͼ8">.</span><span>status(</span><span class="ͼb">403</span><span>)</span><span class="ͼ8">.</span><span>json({ error: </span><span class="ͼe">decision</span><span class="ͼ8">.</span><span>reason })</span><br/><span>  }</span><br/><br/><span></span><span class="ͼ8">const</span><span></span><span class="ͼe">response</span><span></span><span class="ͼ8">=</span><span></span><span class="ͼ8">await</span><span></span><span class="ͼe">forward</span><span>(</span><span class="ͼe">req</span><span>)</span><br/><span></span><span class="ͼe">res</span><span class="ͼ8">.</span><span>send(</span><span class="ͼe">response</span><span>)</span><br/><span>})</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

---

## 2️⃣ Rule Engine

### 规则类型（MVP 版本）

* 单笔金额上限
* 每日总额度
* 每小时调用次数
* 连续高频调用限制
* API 白名单

规则结构：

<pre class="overflow-visible! px-0!" data-start="1839" data-end="1940"><div class="w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-0 bottom-96"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-bg-elevated-secondary"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼ5 ͼj"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span class="ͼ8">interface</span><span></span><span class="ͼe">Rule</span><span> {</span><br/><span>  type: </span><span class="ͼc">"daily_budget"</span><span></span><span class="ͼ8">|</span><span></span><span class="ͼc">"per_call_limit"</span><span></span><span class="ͼ8">|</span><span></span><span class="ͼc">"rate_limit"</span><br/><span>  value: </span><span class="ͼe">number</span><br/><span>}</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

---

## 3️⃣ Budget Manager

### 记录数据

* 今日总花费
* 当前任务累计
* 历史 24 小时记录

存储表结构：

<pre class="overflow-visible! px-0!" data-start="2019" data-end="2136"><div class="w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-0 bottom-96"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-bg-elevated-secondary"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼ5 ͼj"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>transactions (</span><br/><span>  id TEXT </span><span class="ͼ8">PRIMARY</span><span></span><span class="ͼ8">KEY</span><span>,</span><br/><span></span><span class="ͼe">timestamp</span><span> DATETIME,</span><br/><span>  service TEXT,</span><br/><span>  amount </span><span class="ͼe">REAL</span><span>,</span><br/><span>  status TEXT</span><br/><span>)</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

---

## 4️⃣ Rate Limiter

使用：

* 内存计数器
* 或 Redis

规则示例：

* 每 10 分钟最多 5 次支付 API
* 每小时最多 50 次调用

---

## 5️⃣ Risk Detector（简单规则版）

MVP 不做 AI 风控。

只做：

* 金额突增检测
* 调用频率异常
* 未知域名访问
* 非白名单 API

未来可升级为：

* 行为模式分析
* Agent 信誉评分

---

## 6️⃣ Kill Switch

### 全局状态

<pre class="overflow-visible! px-0!" data-start="2393" data-end="2427"><div class="w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-0 bottom-96"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-bg-elevated-secondary"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼ5 ͼj"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span class="ͼ8">let</span><span></span><span class="ͼe">systemPaused</span><span></span><span class="ͼ8">=</span><span></span><span class="ͼb">false</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

Dashboard 可以：

* 暂停所有转发
* 恢复服务

---

# 🖥 五、Dashboard 设计

## 页面结构

### 1️⃣ 总览页

* 今日支出
* 本月支出
* 调用次数
* 当前状态（运行 / 暂停）

---

### 2️⃣ 规则配置页

* 设置每日上限
* 设置单笔上限
* 设置频率限制
* 设置白名单域名

---

### 3️⃣ 实时日志页

显示：

* 请求时间
* API 名称
* 金额
* 状态（通过 / 阻断）
* 阻断原因

---

# 🔐 六、安全设计

* API Key 加密存储
* 不记录银行卡信息
* 所有日志本地保存
* 支持 HTTPS（自签证书即可）

---

# 📊 七、使用流程

## 用户使用步骤

1️⃣ 安装 AgentGuard（Docker）

2️⃣ 登录 Dashboard

3️⃣ 设置规则

4️⃣ 将 Agent 的 API endpoint 改为：

<pre class="overflow-visible! px-0!" data-start="2867" data-end="2909"><div class="w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-0 bottom-96"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-bg-elevated-secondary"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼ5 ͼj"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>http://localhost:8080/proxy/stripe</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

5️⃣ 开始运行 Agent

---

# 🎯 八、MVP 功能范围（严格限制）

必须有：

* HTTP Proxy
* 限额控制
* 频率限制
* Kill Switch
* Dashboard
* Docker 部署

禁止做：

* 多租户
* 云同步
* 复杂风控模型
* 支付清算
* 企业权限系统

---

# 💰 九、商业模式（MVP 阶段）

版本：

### Free

* 本地运行
* 基础规则
* 单 Agent

### Pro（$19/月）

* 多规则
* 邮件提醒
* API token 管理
* 优先更新

---

# 🚀 十、Claude 开发任务拆解

你可以把下面这段丢给 Claude：

---

> 请基于以下要求开发一个本地运行的 AgentGuard 项目：
>
> * Node.js + TypeScript
> * Express HTTP Proxy
> * SQLite 存储交易记录
> * Rule Engine 支持：
>   * 单笔金额限制
>   * 每日预算限制
>   * 调用频率限制
> * 提供 REST API 给 Dashboard
> * 提供 Dockerfile
> * 所有代码结构清晰、可扩展
> * 使用环境变量配置端口
> * 输出完整项目目录结构

---

Claude 会给你第一版骨架。

---

# 📈 十一、未来扩展路径

如果 MVP 成功：

* 行为评分模型
* 企业团队管理
* SaaS 云版本
* 插件式 SDK
* 多 Agent 管理中心
