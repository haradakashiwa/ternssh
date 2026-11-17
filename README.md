<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="web/public/logo-light.png" />
    <img src="web/public/logo-light.png" alt="ternssh logo" width="96" height="93" />
  </picture>
</p>

<h1 align="center">ternssh</h1>

<p align="center">
  SSH workspace on Cloudflare<br />
  Draggable dashboard · Terminal · SFTP · Status monitoring
</p>

<p align="center">
  <a href="LICENSE">GPL-3.0-or-later</a>
  ·
  <a href="README.zh.md">中文</a>
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
    <img src="docs/preview-light.png" alt="ternssh dashboard preview" width="1024" />
  </picture>
</p>

---

**ternssh** is an SSH management tool that runs on Cloudflare Edge. Full documentation: **[Docs](https://ternssh.com/docs/home)**.

## Deployment

### Docker quick start

Using the prebuilt image (recommended):

```bash
docker run -d \
  --name ternssh \
  -p 8787:8787 \
  -v ternssh-data:/app/.wrangler \
  --restart unless-stopped \
  ghcr.io/haradakashiwa/ternssh:latest
```

Or with Docker Compose:

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

Build from source:

```bash
docker compose up -d --build
```

Open http://localhost:8787 after startup. To enable Cloudflare Access authentication, set the `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` environment variables.

### Cloudflare Workers

See the [deployment guide](https://ternssh.com/docs/deployment) for details.

## Desktop client

[**ternssh desktop**](https://github.com/haradakashiwa/ternssh-desktop) is a native client for macOS and Windows: an SSH terminal and server manager with a native UI, no WebView.

- **Works on its own**: manage servers and local terminals on your machine without any site, with credentials in the system keychain.
- **Syncs with your ternssh sites**: add a site and its servers, groups and snippets appear in a tab of their own; changes made in the client are written back to the site. Sites behind Cloudflare Access open a sign-in window when asked, or take a service token.
- **Connects from your machine**: a site only syncs the SSH details, and no traffic goes through it.
- Terminal tabs, SFTP with an editor, snippets, live server status, a tray and a global hotkey.

<p align="center">
  <img src="https://raw.githubusercontent.com/haradakashiwa/ternssh-desktop/main/docs/screenshot-server.png" alt="ternssh desktop" width="1024" />
</p>

### Download

Get the latest from [Releases](https://github.com/haradakashiwa/ternssh-desktop/releases/latest):

| System | File |
|---|---|
| macOS (Apple silicon and Intel) | `ternssh-<version>-macos-universal.dmg` |
| Windows x64 | `…-windows-amd64-setup.exe` (installer) or `…-windows-amd64-portable.zip` |
| Windows ARM64 | `…-windows-arm64-setup.exe` or `…-windows-arm64-portable.zip` |

The builds are not signed with a developer certificate: on macOS, right-click the app and choose "Open" the first time; on Windows, if SmartScreen warns, click "More info" → "Run anyway". Syncing a site needs a recent ternssh, which gives the client the servers' credentials.
