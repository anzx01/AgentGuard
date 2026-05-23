# 安全漏洞披露政策

## 支持的版本

| 版本 | 支持状态 |
| ---- | -------- |
| main 分支最新版 | ✅ 积极维护 |
| 历史发布版本 | ❌ 不再提供安全修复 |

## 报告漏洞

**请勿通过公开 GitHub Issue 报告安全漏洞。**

若你发现了安全漏洞，请通过以下方式私下告知我们：

1. 前往 [GitHub Security Advisories](https://github.com/anzx01/AgentGuard/security/advisories/new) 提交私密报告
2. 或发送邮件至项目维护者（见 README 或 package.json 中的联系方式）

报告中请尽量包含：

- 漏洞类型（如 SQL 注入、身份绕过、信息泄露等）
- 受影响的文件路径及代码行号
- 重现步骤（越详细越好）
- 潜在影响评估
- 如有，提供修复建议

## 响应时间

- 我们会在 **72 小时内**确认收到报告
- 在 **7 天内**提供初步评估和处理计划
- 修复完成后会在 Release Notes 中致谢报告者（除非你希望匿名）

## 披露政策

我们遵循**协调披露（Coordinated Disclosure）**原则：

- 在修复发布之前，请给我们合理的修复时间（通常 90 天）
- 修复发布后，欢迎你公开披露漏洞详情
- 我们会在 [Security Advisories](https://github.com/anzx01/AgentGuard/security/advisories) 中公开记录已修复的漏洞

## 范围

**在范围内：**
- `packages/core/src/` 中的代理服务、认证逻辑、规则引擎
- `packages/dashboard/src/` 中的前端安全问题（XSS、CSRF 等）
- Docker 部署配置中的安全配置问题

**不在范围内：**
- 依赖库自身的已知漏洞（请向对应上游报告）
- 需要物理访问才能利用的攻击场景
- 用户自行配置不当导致的问题

感谢你帮助 AgentGuard 变得更安全。
