> [← README](../../README.md) · [Wiki](../README.md) · [English](../en/Home.md)
>
> [简介](../zh/Home.md) · [功能特性](../zh/Features.md) · [技术栈](../zh/Tech-Stack.md) · [快速开始](../zh/Getting-Started.md) · **部署** · [项目结构](../zh/Project-Structure.md) · [系统架构](../zh/Architecture.md) · [小部件](../zh/Widgets.md) · [API](../zh/API.md) · [数据库](../zh/Database.md) · [设置](../zh/Settings.md) · [安全](../zh/Security.md) · [配置](../zh/Configuration.md) · [路线](../zh/Roadmap.md) · [License](../zh/License.md)

## 部署

### Cloudflare Workers

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/haradakashiwa/ternssh-cloudflare-workers-template">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
</a>

点击按钮连接 GitHub 仓库并部署到 Cloudflare Workers。平台会自动检测 `npm run build` 与 `npm run deploy` 作为构建与发布命令。

生产环境鉴权（Cloudflare Access / Basic Auth）见 [安全说明 · 鉴权](../zh/Security.md#鉴权)。

### Docker（自托管）

Docker 镜像通过 Wrangler 本地模式运行完整应用，适合内网自托管或快速体验。官方镜像：`ghcr.io/haradakashiwa/ternssh`。

**docker run**（推荐预构建镜像）：

```bash
docker run -d \
  --name ternssh \
  -p 8787:8787 \
  -v ternssh-data:/app/.wrangler \
  --restart unless-stopped \
  ghcr.io/haradakashiwa/ternssh:latest
```

**docker compose**：

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

指定版本：`TERNSSH_TAG=1.0.0 docker compose -f docker-compose.ghcr.yml up -d`

自定义端口：`PORT=8080 docker compose -f docker-compose.ghcr.yml up -d`

从源码构建：`docker compose up -d --build`

访问 `http://localhost:8787`（或你映射的端口）。数据持久化于卷 `/app/.wrangler`。

Basic Auth 与 onboarding 说明见 [安全说明 · HTTP Basic Auth（数据库凭据）](../zh/Security.md#http-basic-auth数据库凭据)。
