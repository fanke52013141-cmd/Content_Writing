# 墨流 AI 创作台

面向独立公众号创作者的 Windows 本地 AI 内容创作工具。V1.1 范围以
[`docs/product/v1.1-baseline.md`](docs/product/v1.1-baseline.md) 为准。

## 当前开发状态

Phase 0 工程基础已经通过真实 Docker 冷启动验收，当前进入 Phase 1 核心对象开发。已经包含：

- Next.js 16 中文桌面 App Shell；
- NestJS/Fastify API、健康检查与 OpenAPI；
- 本地单用户及可选 PIN 哈希接口；
- PostgreSQL 迁移、Outbox、Prompt/Generation Trace 不可变约束；
- 独立 BullMQ Worker、Mock Model Provider 和 Outbox Dispatcher；
- Docker Compose 和 Windows 一键启动、停止、加密备份脚本；
- Account / Account Profile Version 的数据库约束、完整 API 和账号定位页面；
- 可恢复归档、手动定位草稿、显式激活、单 Active 版本与不可变历史；
- Content Project / Creation Origin、显式完成状态、账号 Context 与单 Primary 约束。
- 独立 Topic 选题资产、可选账号 Context、项目关系、单 Primary 与关系历史保留；
- 选题库页面支持创建、编辑、项目关联/解绑以及归档恢复。

Material 及后续创作模块仍在按基线顺序开发，当前版本不应视为可验收的完整 V1。

## Windows 本地启动

1. 安装并启动 Docker Desktop，启用 Docker Compose。
2. 双击 `启动平台.cmd`。
3. 首次启动会生成 `.env.local` 随机密码，构建镜像并打开
   `http://127.0.0.1:3000`。
4. 使用完毕后双击 `停止平台.cmd`，数据卷和上传文件不会删除。
5. 双击 `备份数据.cmd` 创建 `.cwbackup` 加密备份，默认保留 7 个每日备份和
   4 个每周备份。

恢复备份会替换当前数据库和上传文件，因此必须显式指定备份并确认：

```powershell
powershell -File scripts/restore.ps1 -BackupFile backups/daily/<file>.cwbackup
```

如果启动失败，可运行：

```powershell
powershell -File scripts/doctor.ps1
```

## 本地开发

要求 Node.js 24 LTS 和 pnpm 11：

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

仅启动 Web 开发服务器：

```powershell
pnpm --filter @content-writing/web dev
```

API 和 Worker 需要 PostgreSQL、Redis 与已执行的迁移，推荐通过 Compose 启动。

## 数据安全

- 服务默认只绑定 `127.0.0.1`；PostgreSQL 和 Redis 不向宿主机暴露端口。
- `.env.local`、上传文件、数据目录和备份均被 Git 忽略。
- AI 生成结果先进入不可变候选，不会自动切换 Current/Primary。
- V1 不包含微信热点、AI 生图、公众号管理或直接发布。
