> [← README](../../README.md) · [Wiki](../README.md) · [English](../en/Home.md)
>
> [简介](../zh/Home.md) · [功能特性](../zh/Features.md) · [技术栈](../zh/Tech-Stack.md) · [快速开始](../zh/Getting-Started.md) · [部署](../zh/Deployment.md) · [项目结构](../zh/Project-Structure.md) · [系统架构](../zh/Architecture.md) · [小部件](../zh/Widgets.md) · [API](../zh/API.md) · [数据库](../zh/Database.md) · [设置](../zh/Settings.md) · **安全** · [配置](../zh/Configuration.md) · [路线](../zh/Roadmap.md) · [License](../zh/License.md)

## 安全说明

- 未配置 Cloudflare Access 时，实例**必须**完成首次 onboarding 设置登录凭据，不存在无认证的「开放模式」
- Access 模式仅作登录门禁，所有通过校验的请求使用内置用户 `default` 的数据
- HTTP Basic Auth 凭据存于 D1 `basic_auth_credentials` 表（密码为 PBKDF2 哈希，非明文）
- SSH 密码/私钥存于 D1 `credentials` 表（按服务器引用）；vault 条目存于 `saved_passwords` / `saved_private_keys`
- 启用 Basic Auth 后，**所有路径与资源**均需先通过认证方可访问；响应附带 `X-Robots-Tag: noindex` 以降低被搜索引擎收录的风险
- 全站 HTTPS / WSS；DO 实例按 session 隔离

## 鉴权

ternssh 根据 Cloudflare Access 是否配置、以及 D1 中是否已有 Basic Auth 凭据，自动进入以下模式之一：

| 模式 | 条件 | 说明 |
|------|------|------|
| **onboarding** | 未配置 Access，且尚未设置 Basic Auth | 首次访问进入设置页，创建用户名与密码 |
| **basic** | 未配置 Access，且已设置 Basic Auth | 浏览器 HTTP Basic Auth，凭据来自数据库 |
| **access** | 已配置 `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` | Cloudflare Zero Trust JWT 校验 |

> 配置了 Access 后，不再使用数据库中的 Basic Auth 凭据。Access 变量**不要**写进 `wrangler.production.jsonc`，在 Workers Dashboard 或 Docker 的 `.dev.vars` 中配置。

### 首次设置（onboarding）

未配置 Cloudflare Access 且数据库中尚无登录凭据时，访问实例会进入 **onboarding** 页面：

1. 设置用户名
2. 设置密码并再次确认
3. 提交后凭据写入 D1 `basic_auth_credentials` 表
4. 页面刷新，浏览器弹出 Basic Auth 登录框

本地开发（`npm run dev:server`）与 Docker / Workers 自托管均走同一流程。

### 配置 Cloudflare Access

适用于已部署到 **Cloudflare Workers** 的实例。Access 在 Cloudflare 边缘拦截未登录请求，登录成功后 Cloudflare 会向 Worker 注入 `Cf-Access-Jwt-Assertion` 头，ternssh 据此校验 JWT。

#### 1. 创建 Access 应用

1. 打开 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Access** → **Applications**
2. 点击 **Add an application** → 选择 **Self-hosted**
3. 填写应用名称（如 `ternssh`）
4. **Session Duration** 按需设置
5. 在 **Application domain** 中填写实际访问域名，必须与用户浏览器地址栏一致，例如：
   - `ternssh.your-subdomain.workers.dev`（`workers.dev` 子域）
   - `ssh.example.com`（自定义域名）
6. 添加 **Policy**（如 Allow → Emails ending in `@yourcompany.com`，或 One-time PIN）
7. 保存应用

> `workers.dev` 与自定义域名是**不同的 Application domain**，需分别创建 Access 应用并分别配置 AUD。

#### 2. 获取 AUD 与 Team Domain

| 项 | 获取方式 |
|----|----------|
| **AUD** | Access 应用详情页 → **Application Audience (AUD) Tag**（64 位 hex） |
| **Team Domain** | Zero Trust → **Settings** → **Custom pages** → **Team domain**，形如 `your-team.cloudflareaccess.com`（**不要**加 `https://`） |

#### 3. 配置 Worker 变量

Cloudflare Dashboard → **Workers & Pages** → 选择 ternssh Worker → **Settings** → **Variables and Secrets**：

| 名称 | 类型 | 值 |
|------|------|-----|
| `ACCESS_TEAM_DOMAIN` | Variable（明文） | `your-team.cloudflareaccess.com` |
| `ACCESS_AUD` | Secret（推荐）或 Variable | 上一步复制的 AUD Tag |

保存后立即生效，无需重新部署。

#### 4. 验证

1. 在浏览器访问 Worker 地址
2. 应先跳转到 Cloudflare Access 登录页
3. 通过策略校验后进入 ternssh 仪表盘

若返回 401 且提示 `Missing Cf-Access-Jwt-Assertion`，通常是 Application domain 与访问 URL 不匹配，或变量未正确设置。

#### 本地开发（可选）

复制 `.dev.vars.example` 为 `.dev.vars` 并填入：

```bash
ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
ACCESS_AUD=your-64-char-aud-tag
```

本地 `wrangler dev` 不会自动经过 Access 登录页；需自行携带有效 JWT 才能测试 Access 模式，一般仅用于验证变量格式。

### HTTP Basic Auth（数据库凭据）

Basic Auth **不通过环境变量配置**。凭据在 onboarding 时写入 D1，之后每次请求由服务端校验。

#### 适用场景

- Docker / 自托管
- 未启用 Cloudflare Access 的 Workers 实例

#### Docker

首次启动后访问实例 URL，按 onboarding 流程设置账号密码即可。凭据保存在挂载卷 `/app/.wrangler` 内的本地 D1 数据库中。

```bash
docker compose -f docker-compose.ghcr.yml up -d
# 或从源码：docker compose up -d --build
```

```bash
docker run -d \
  --name ternssh \
  -p 8787:8787 \
  -v ternssh-data:/app/.wrangler \
  ghcr.io/haradakashiwa/ternssh:latest
```

#### 登录后管理

Basic Auth 模式下，打开 **设置 → 安全** 可：

- 修改用户名（需输入当前密码）
- 修改密码（需输入新密码并确认）
- **退出登录**（清除浏览器缓存的 Basic Auth 凭据）

修改凭据保存后会自动退出，需用新凭据重新登录。

#### 失败锁定

同一 IP 密码错误 **3 次**将锁定 **1 小时**（按 `CF-Connecting-IP` 识别；登录成功后清零）。

#### 相关 API

| 接口 | 说明 |
|------|------|
| `GET /api/v1/onboarding/status` | 查询当前鉴权模式（onboarding 阶段可匿名访问） |
| `POST /api/v1/onboarding/setup` | 首次设置凭据 |
| `GET /api/v1/auth/credentials` | 获取当前用户名 |
| `PUT /api/v1/auth/credentials` | 修改用户名/密码 |
| `POST /api/v1/auth/logout` | 退出登录 |
