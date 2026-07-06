> [← README](../../README.en.md) · [Wiki](../README.md) · [中文](../zh/Home.md)
>
> [Overview](../en/Home.md) · [Features](../en/Features.md) · [Tech Stack](../en/Tech-Stack.md) · [Quick Start](../en/Getting-Started.md) · [Deployment](../en/Deployment.md) · [Project Structure](../en/Project-Structure.md) · [Architecture](../en/Architecture.md) · [Widgets](../en/Widgets.md) · [API](../en/API.md) · **Database** · [Settings](../en/Settings.md) · [Security](../en/Security.md) · [Configuration](../en/Configuration.md) · [Roadmap](../en/Roadmap.md) · [License](../en/License.md)

## Database (D1)

Migrations live in `server/migrations/`:

| Migration | Contents |
|-----------|----------|
| `0001_init.sql` | users, servers, credentials, dashboards, widgets, sessions |
| `0002_server_groups.sql` | server_groups; servers add group_id / sort_order |
| `0003_saved_passwords.sql` | saved_passwords credential vault |
| `0004_saved_private_keys.sql` | saved_private_keys credential vault |
| `0005_basic_auth_lockouts.sql` | basic_auth_lockouts login lockout |
| `0006_basic_auth_credentials.sql` | basic_auth_credentials app-layer Basic Auth |

```bash
npm run db:migrate:local   # Local
npm run db:migrate         # Remote (included in deploy)
```
