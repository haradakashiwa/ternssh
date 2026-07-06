> [← README](../../README.en.md) · [Wiki](../README.md) · [中文](../zh/Home.md)
>
> [Overview](../en/Home.md) · [Features](../en/Features.md) · [Tech Stack](../en/Tech-Stack.md) · [Quick Start](../en/Getting-Started.md) · **Deployment** · [Project Structure](../en/Project-Structure.md) · [Architecture](../en/Architecture.md) · [Widgets](../en/Widgets.md) · [API](../en/API.md) · [Database](../en/Database.md) · [Settings](../en/Settings.md) · [Security](../en/Security.md) · [Configuration](../en/Configuration.md) · [Roadmap](../en/Roadmap.md) · [License](../en/License.md)

## Deploy

### Cloudflare Workers

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/haradakashiwa/ternssh-cloudflare-workers-template">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
</a>

Click the button to connect your GitHub repo and deploy to Cloudflare Workers. The platform auto-detects `npm run build` and `npm run deploy` as the build and deploy commands.

For production auth (Cloudflare Access / Basic Auth), see [Security · Authentication](../en/Security.md#authentication).

### Docker (self-hosted)

The Docker image runs the full app via Wrangler local mode—good for private networks or a quick trial. Official image: `ghcr.io/haradakashiwa/ternssh`.

**docker run** (pre-built image):

```bash
docker run -d \
  --name ternssh \
  -p 8787:8787 \
  -v ternssh-data:/app/.wrangler \
  --restart unless-stopped \
  ghcr.io/haradakashiwa/ternssh:latest
```

**docker compose**:

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

Pin a version: `TERNSSH_TAG=1.0.0 docker compose -f docker-compose.ghcr.yml up -d`

Custom port: `PORT=8080 docker compose -f docker-compose.ghcr.yml up -d`

Build from source: `docker compose up -d --build`

Open `http://localhost:8787` (or your mapped port). Data persists in the `/app/.wrangler` volume.

Basic Auth setup: [Security · HTTP Basic Auth (database credentials)](../en/Security.md#http-basic-auth-database-credentials).
