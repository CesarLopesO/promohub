# PROMOHUB

PROMOHUB é um SaaS de automação para afiliados Amazon e Mercado Livre.

Este repositório usa Turborepo com apps Next.js e NestJS, pacotes compartilhados, PostgreSQL, Redis, Prisma, ESLint, Prettier, Husky e Commitlint.

## Stack

- Turborepo
- Next.js 15
- NestJS
- TypeScript
- TailwindCSS
- Shadcn/ui
- PostgreSQL
- Prisma
- Redis
- Docker Compose

## Estrutura

```txt
apps/
  web/      Next.js
  api/      NestJS + Prisma
packages/
  ui/       componentes compartilhados
  shared/   utilitários compartilhados
  types/    tipos compartilhados
```

## Como rodar

1. Instale as dependências:

```bash
npm install
```

2. Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

3. Gere o Prisma Client:

```bash
npm run db:generate
```

4. Suba tudo com um único comando:

```bash
npm run dev
```

Esse comando inicia PostgreSQL, Redis, API e Web.

- Web: http://localhost:3000
- API: http://localhost:3001
- Health check: http://localhost:3001/health

## Scripts

- `npm run dev`: sobe infraestrutura Docker e apps em modo desenvolvimento.
- `npm run dev:apps`: sobe apenas web e api.
- `npm run dev:infra`: sobe PostgreSQL e Redis em background.
- `npm run dev:infra:down`: para a infraestrutura Docker.
- `npm run build`: build dos apps e pacotes.
- `npm run lint`: lint do monorepo.
- `npm run typecheck`: checagem TypeScript.
- `npm run format`: formata arquivos com Prettier.
- `npm run db:generate`: gera Prisma Client.
- `npm run db:migrate`: executa migrações Prisma na API.

## Commits

O projeto usa Commitlint com Conventional Commits.

Exemplos:

```txt
feat: add product import workflow
fix: validate amazon affiliate url
chore: update dependencies
```

## Observações

Nenhuma regra de negócio foi implementada nesta base. A API possui apenas bootstrap, health check e Prisma configurado.
