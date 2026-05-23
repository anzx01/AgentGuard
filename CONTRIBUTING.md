# 贡献指南

感谢你对 AgentGuard 的关注！本文档说明如何参与贡献。

## 开始之前

- 阅读 [README](README.md) 了解项目概况
- 阅读 [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md) 了解社区行为准则
- 安全漏洞请勿通过 Issue 公开披露，参见 [SECURITY](SECURITY.md)

## 提交 Issue

- 使用 Issue 模板，填写尽量完整的信息
- Bug 报告请附上复现步骤和环境信息
- Feature Request 请说明使用场景和动机

## 提交 Pull Request

### 环境准备

```bash
# Node.js >= 20
npm install

cp packages/core/.env.example packages/core/.env

# 启动开发环境
npm run dev --workspace=packages/core
npm run dev --workspace=packages/dashboard
```

### 开发流程

1. Fork 本仓库，基于 `main` 创建功能分支：
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. 进行修改，遵守以下编码约定：
   - TypeScript 强类型，禁止使用 `any`
   - 单文件不超过 300 行
   - 每个文件夹中文件数不超过 8 个
   - 禁止 CommonJS，统一使用 ESM

3. 确保代码可正常构建：
   ```bash
   npm run build --workspace=packages/core
   npm run build --workspace=packages/dashboard
   ```

4. 提交 commit，message 使用英文且遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：
   ```
   feat: add rate limit per agent token
   fix: correct budget reset timing
   docs: update proxy configuration example
   ```

5. 推送分支并开启 Pull Request，填写 PR 模板

### PR 合并标准

- 通过 CI 构建检查
- 无破坏性 API 变更（或已在 PR 中充分说明）
- 代码符合项目架构风格
- 至少获得一位维护者 Review 通过

## 项目结构

```
AgentGuard/
  packages/
    core/        Node.js/TypeScript 代理与管理 API
      src/
        api/       路由层（每个资源一个文件）
        db/        数据库初始化与访问
        engine/    规则引擎、风险检测
        proxy/     代理路由
        services/  业务逻辑服务
    dashboard/   Next.js 管理界面
  docker-compose.yml
  package.json
```

## 许可证

提交 Pull Request 即表示你同意将代码以 [MIT License](LICENSE) 授权给本项目。
