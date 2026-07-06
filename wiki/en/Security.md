> [← README](../../README.en.md) · [Wiki](../README.md) · [中文](../zh/Home.md)
>
> [Overview](../en/Home.md) · [Features](../en/Features.md) · [Tech Stack](../en/Tech-Stack.md) · [Quick Start](../en/Getting-Started.md) · [Deployment](../en/Deployment.md) · [Project Structure](../en/Project-Structure.md) · [Architecture](../en/Architecture.md) · [Widgets](../en/Widgets.md) · [API](../en/API.md) · [Database](../en/Database.md) · [Settings](../en/Settings.md) · **Security** · [Configuration](../en/Configuration.md) · [Roadmap](../en/Roadmap.md) · [License](../en/License.md)

## Security

- Without Cloudflare Access, instances **must** complete initial onboarding to set login credentials—there is no unauthenticated “open mode”
- Access mode is a login gate only; all verified requests use the built-in `default` user data
- HTTP Basic Auth credentials live in D1 `basic_auth_credentials` (password stored as a PBKDF2 hash, not plain text)
- SSH passwords/keys are stored in D1 `credentials` (per server); vault entries in `saved_passwords` / `saved_private_keys`
- Once Basic Auth is enabled, **every path and asset** requires authentication first; responses include `X-Robots-Tag: noindex` to reduce search-engine indexing
- Full-site HTTPS / WSS; DO instances isolated per session

## Authentication

ternssh picks one of three modes based on whether Cloudflare Access is configured and whether Basic Auth credentials exist in D1:

| Mode | Condition | Description |
|------|-----------|-------------|
| **onboarding** | Access not configured, no Basic Auth yet | First visit shows setup page to create username and password |
| **basic** | Access not configured, Basic Auth set up | Browser HTTP Basic Auth; credentials from the database |
| **access** | `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` configured | Cloudflare Zero Trust JWT verification |

> When Access is configured, database Basic Auth credentials are not used. Set Access variables in the Workers Dashboard or Docker `.dev.vars`—**not** in `wrangler.production.jsonc`.

### Initial setup (onboarding)

When Cloudflare Access is not configured and no login credentials exist in the database, the instance enters **onboarding**:

1. Choose a username
2. Set a password and confirm it
3. Credentials are written to D1 `basic_auth_credentials`
4. The page reloads and the browser shows the Basic Auth login prompt

Local dev (`npm run dev:server`), Docker, and self-hosted Workers all follow the same flow.

### Configure Cloudflare Access

For instances deployed to **Cloudflare Workers**. Access intercepts unauthenticated requests at the edge; after login Cloudflare injects a `Cf-Access-Jwt-Assertion` header that ternssh validates.

#### 1. Create an Access application

1. Open [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Access** → **Applications**
2. Click **Add an application** → choose **Self-hosted**
3. Set an application name (e.g. `ternssh`)
4. Set **Session Duration** as needed
5. Under **Application domain**, enter the exact URL users visit, for example:
   - `ternssh.your-subdomain.workers.dev` (`workers.dev` subdomain)
   - `ssh.example.com` (custom domain)
6. Add a **Policy** (e.g. Allow → Emails ending in `@yourcompany.com`, or One-time PIN)
7. Save the application

> `workers.dev` and custom domains are **separate Application domains**—create one Access app per URL and use matching AUD tags.

#### 2. Get AUD and Team Domain

| Item | Where to find it |
|------|------------------|
| **AUD** | Application details → **Application Audience (AUD) Tag** (64-char hex) |
| **Team Domain** | Zero Trust → **Settings** → **Custom pages** → **Team domain**, e.g. `your-team.cloudflareaccess.com` (**no** `https://`) |

#### 3. Set Worker variables

Cloudflare Dashboard → **Workers & Pages** → your ternssh Worker → **Settings** → **Variables and Secrets**:

| Name | Type | Value |
|------|------|-------|
| `ACCESS_TEAM_DOMAIN` | Variable (plain text) | `your-team.cloudflareaccess.com` |
| `ACCESS_AUD` | Secret (recommended) or Variable | AUD Tag from step 2 |

Changes take effect immediately—no redeploy required.

#### 4. Verify

1. Visit your Worker URL in a browser
2. You should be redirected to the Cloudflare Access login page first
3. After passing the policy, the ternssh dashboard loads

A 401 with `Missing Cf-Access-Jwt-Assertion` usually means the Application domain does not match the URL you visit, or variables are misconfigured.

#### Local development (optional)

Copy `.dev.vars.example` to `.dev.vars`:

```bash
ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
ACCESS_AUD=your-64-char-aud-tag
```

Local `wrangler dev` does not go through the Access login page; you need a valid JWT to test Access mode locally—mainly useful for checking variable format.

### HTTP Basic Auth (database credentials)

Basic Auth is **not** configured via environment variables. Credentials are created during onboarding and stored in D1; the server validates them on each request.

#### When it applies

- Docker / self-hosted
- Workers instances without Cloudflare Access

#### Docker

After first start, visit the instance URL and complete onboarding. Credentials persist in the local D1 database inside the `/app/.wrangler` volume.

```bash
docker compose -f docker-compose.ghcr.yml up -d
# or from source: docker compose up -d --build
```

```bash
docker run -d \
  --name ternssh \
  -p 8787:8787 \
  -v ternssh-data:/app/.wrangler \
  ghcr.io/haradakashiwa/ternssh:latest
```

#### After login

In Basic Auth mode, open **Settings → Security** to:

- Change username (requires current password)
- Change password (requires confirmation)
- **Sign out** (clears the browser’s cached Basic Auth credentials)

After saving credential changes, you are signed out automatically and must log in again with the new credentials.

#### Lockout

**3** failed password attempts from the same IP lock access for **1 hour** (via `CF-Connecting-IP`; cleared on successful login).

#### Related API

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/onboarding/status` | Current auth mode (anonymous during onboarding) |
| `POST /api/v1/onboarding/setup` | Initial credential setup |
| `GET /api/v1/auth/credentials` | Current username |
| `PUT /api/v1/auth/credentials` | Update username/password |
| `POST /api/v1/auth/logout` | Sign out |
