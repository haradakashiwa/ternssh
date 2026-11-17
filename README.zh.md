<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="web/public/logo-light.png" />
    <img src="web/public/logo-light.png" alt="ternssh logo" width="96" height="93" />
  </picture>
</p>

<h1 align="center">ternssh</h1>

<p align="center">
  基于 Cloudflare 的 SSH 工作台<br />
  可拖拽仪表盘 · 终端 · SFTP · 状态监控
</p>

<p align="center">
  <a href="LICENSE">GPL-3.0-or-later</a>
  ·
  <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/haradakashiwa/ternssh-cloudflare-workers-template">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/preview-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="docs/preview-light.png" />
    <img src="docs/preview-light.png" alt="ternssh 仪表盘预览" width="1024" />
  </picture>
</p>

---

**ternssh** 是一款运行在 Cloudflare Edge 上的 SSH 管理工具。完整文档见 **[文档](https://ternssh.com/docs/home)**。

## 部署

### Docker 一键启动

使用预构建镜像（推荐）：

```bash
docker run -d \
  --name ternssh \
  -p 8787:8787 \
  -v ternssh-data:/app/.wrangler \
  --restart unless-stopped \
  ghcr.io/haradakashiwa/ternssh:latest
```

或使用 Docker Compose：

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

从源码构建：

```bash
docker compose up -d --build
```

启动后访问 http://localhost:8787。如需启用 Cloudflare Access 认证，可添加环境变量 `ACCESS_TEAM_DOMAIN` 与 `ACCESS_AUD`。

### Cloudflare Workers

详见 [部署指南](https://ternssh.com/docs/deployment)。

## 桌面客户端

[**ternssh desktop**](https://github.com/haradakashiwa/ternssh-desktop) 是 ternssh 的原生桌面客户端，支持 macOS 和 Windows：SSH 终端与服务器管理工具，界面为原生 UI，没有 WebView。

- **本机即可使用**：不添加站点也能管理服务器和本地终端，凭据存在系统钥匙串。
- **与站点同步**：添加 ternssh 站点后，站点上的服务器、分组和快捷指令出现在独立的标签里，在客户端的修改会写回站点。站点受 Cloudflare Access 保护时，会弹出登录窗口，也可以使用服务令牌。
- **所有连接都从本机发起**：站点只用来同步 SSH 信息，不经它转发流量。
- 多标签终端、SFTP 与文件编辑器、快捷指令、服务器状态实时监控、托盘与全局快捷键。

<p align="center">
  <img src="https://raw.githubusercontent.com/haradakashiwa/ternssh-desktop/main/docs/screenshot-server.png" alt="ternssh desktop" width="1024" />
</p>

### 下载

在 [Releases](https://github.com/haradakashiwa/ternssh-desktop/releases/latest) 下载最新版本：

| 系统 | 文件 |
|---|---|
| macOS（Apple 芯片与 Intel） | `ternssh-<版本>-macos-universal.dmg` |
| Windows x64 | `…-windows-amd64-setup.exe`（安装包）或 `…-windows-amd64-portable.zip`（免安装） |
| Windows ARM64 | `…-windows-arm64-setup.exe` 或 `…-windows-arm64-portable.zip` |

安装包没有开发者证书签名：macOS 首次打开时请右键应用选「打开」；Windows 若出现 SmartScreen 提示，点「更多信息」→「仍要运行」。同步站点需要较新版本的 ternssh（客户端需要从站点获取服务器凭据）。
