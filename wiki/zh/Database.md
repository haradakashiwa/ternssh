> [← README](../../README.md) · [Wiki](../README.md) · [English](../en/Home.md)
>
> [简介](../zh/Home.md) · [功能特性](../zh/Features.md) · [技术栈](../zh/Tech-Stack.md) · [快速开始](../zh/Getting-Started.md) · [部署](../zh/Deployment.md) · [项目结构](../zh/Project-Structure.md) · [系统架构](../zh/Architecture.md) · [小部件](../zh/Widgets.md) · [API](../zh/API.md) · **数据库** · [设置](../zh/Settings.md) · [安全](../zh/Security.md) · [配置](../zh/Configuration.md) · [路线](../zh/Roadmap.md) · [License](../zh/License.md)

## 数据库（D1）

迁移文件位于 `server/migrations/`：

| 迁移 | 内容 |
|------|------|
| `0001_init.sql` | users、servers、credentials、dashboards、widgets、sessions |
| `0002_server_groups.sql` | server_groups，servers 增加 group_id / sort_order |
| `0003_saved_passwords.sql` | saved_passwords 凭据 vault |
| `0004_saved_private_keys.sql` | saved_private_keys 凭据 vault |
| `0005_basic_auth_lockouts.sql` | basic_auth_lockouts 登录失败锁定 |
| `0006_basic_auth_credentials.sql` | basic_auth_credentials 应用层 Basic Auth 凭据 |

```bash
npm run db:migrate:local   # 本地
npm run db:migrate         # 远程（deploy 已包含）
```
