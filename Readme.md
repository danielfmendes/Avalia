1. Create the (D1) Database

```bash
npx wrangler d1 create habitacao_db
```

```bash
npx wrangler d1 execute habitacao_db --remote --file=./Create_Tables.sql
```

```bash
npx wrangler d1 execute habitacao_db --remote --file=./Insert_Queries.sql 
```

2. Create the API (Cloudflare Worker)

```bash
npm install -D typescript @cloudflare/workers-types
```

3.

```bash
npm dlx shadcn@latest init --preset b0 --template vite 
```

```bash
npx shadcn@latest add table badge button dropdown-menu mode-toggle
```
