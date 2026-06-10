# Deploy de producao

Esta configuracao executa API, frontend, PostgreSQL, Redis e Nginx no Docker
Compose. Somente o Nginx publica uma porta no host. PostgreSQL e Redis ficam
restritos a rede interna do Compose e usam volumes persistentes.

## Pre-requisitos

- Servidor Linux com Docker Engine e Docker Compose v2.
- Dominio apontando para o servidor.
- TLS terminado por um proxy externo, load balancer ou uma extensao futura do
  Nginx deste projeto.
- Acesso seguro para armazenar segredos e backups fora do servidor.

## Configuracao inicial

Crie o arquivo local de producao e restrinja suas permissoes:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Preencha todos os placeholders. `PEPPABOT_DATABASE_URL` deve usar exatamente
o mesmo usuario, senha e banco definidos em `PEPPABOT_POSTGRES_USER`,
`PEPPABOT_POSTGRES_PASSWORD` e `PEPPABOT_POSTGRES_DB`, mantendo `postgres`
como hostname. O prefixo `PEPPABOT_` evita conflito com o `.env` local de
desenvolvimento.

Gere segredos independentes para `JWT_SECRET` e `ASAAS_WEBHOOK_TOKEN`. Gere a
chave de criptografia com:

```bash
npm run crypto:generate-key -w @promohub/api
```

`PEPPABOT_APP_ENCRYPTION_KEY`, exposta como `APP_ENCRYPTION_KEY` dentro da
API, e imutavel depois que qualquer credencial for salva. A troca dessa chave
impede a leitura de todos os segredos ja criptografados. Armazene uma copia em
um cofre de segredos e inclua-a no plano de recuperacao.

Configure a origem publica exata do frontend. Multiplas origens devem ser
separadas por virgula; nunca use `*` em producao:

```dotenv
PEPPABOT_CORS_ORIGIN=https://peppabot.com
```

O rate limit usa Redis compartilhado para funcionar corretamente com mais de
uma instancia da API:

```dotenv
PEPPABOT_RATE_LIMIT_ENABLED=true
PEPPABOT_RATE_LIMIT_REDIS_URL=redis://redis:6379
PEPPABOT_ADMIN_AUDIT_LOG_ENABLED=true
```

O fallback em memoria existe apenas para desenvolvimento e indisponibilidade
temporaria. Em producao, monitore a saude do Redis para evitar limites
isolados por processo.

## Asaas em producao

Use uma chave criada na conta Asaas de producao, nunca uma chave do Sandbox:

```dotenv
PEPPABOT_ASAAS_BASE_URL=https://api.asaas.com/v3
PEPPABOT_ASAAS_API_KEY='<chave-de-producao>'
PEPPABOT_ASAAS_WALLET_ID=<wallet-id-quando-aplicavel>
PEPPABOT_ASAAS_WEBHOOK_TOKEN=<token-longo-e-aleatorio>
```

Cadastre no Asaas o webhook publico:

```text
https://SEU_DOMINIO/api/billing/webhook/asaas
```

O caminho interno da API e `/billing/webhook/asaas`; o prefixo publico `/api`
e removido pelo Nginx. Configure no Asaas o mesmo token definido em
`PEPPABOT_ASAAS_WEBHOOK_TOKEN` e valide o recebimento de eventos antes de
cobrar clientes reais. Mantenha a API key entre aspas simples no arquivo para
que caracteres `$` sejam tratados literalmente pelo Docker Compose.

O token do webhook e obrigatorio. Eventos sao idempotentes por `eventId`,
limitados por IP e armazenados com campos sensiveis redigidos.

Referencias oficiais:

- https://docs.asaas.com/docs/initial-settings
- https://docs.asaas.com/docs/about-webhooks

## Subida e atualizacao

Valide a configuracao interpolada sem imprimir ou compartilhar sua saida, pois
ela contem segredos:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml config --quiet
```

Construa e inicie os servicos:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d --build
```

A API executa `prisma migrate deploy` antes de iniciar. Acompanhe a subida:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml ps
docker compose --env-file .env.production \
  -f docker-compose.production.yml logs -f api web nginx
```

Teste `https://SEU_DOMINIO/api/health` e a pagina inicial. Para atualizar,
obtenha a nova versao do codigo e repita `up -d --build`.

## Backup diario

O script gera um dump PostgreSQL em formato custom e remove arquivos locais
mais antigos que `PEPPABOT_BACKUP_RETENTION_DAYS`:

```bash
./scripts/backup-postgres.sh
```

Agende diariamente, por exemplo as 03:15:

```cron
15 3 * * * cd /opt/peppabot && ./scripts/backup-postgres.sh >> /var/log/peppabot-backup.log 2>&1
```

Copie cada backup para armazenamento externo criptografado. O volume Docker
nao substitui backup. Monitore falhas do cron e teste restauracoes
periodicamente.

## Restore

O restore e destrutivo para os dados atuais. Antes dele, tire um novo backup,
interrompa API e frontend e mantenha o PostgreSQL ativo:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml stop nginx web api

./scripts/restore-postgres.sh backups/postgres/peppabot-YYYYMMDDTHHMMSSZ.dump

docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d api web nginx
```

Depois, verifique os logs, `/api/health`, login, billing e sessoes WhatsApp.
Se a restauracao vier de uma versao anterior, a API aplicara as migrations
pendentes ao reiniciar.

## Operacao

- Nunca versione `.env.production`, dumps ou chaves.
- Restrinja SSH e a porta publicada pelo Nginx no firewall.
- Use HTTPS antes de expor login, tokens e webhook.
- O Nginx adiciona CSP, protecao contra framing, `nosniff`, politica de
  referencia e uma `Permissions-Policy` restritiva. Revise a CSP antes de
  adicionar scripts, frames ou provedores externos ao frontend.
- Consulte `/api/admin/audit-logs` com uma conta `ADMIN` para investigar
  alteracoes administrativas.
- Monitore espaco dos volumes `peppabot_postgres_data` e
  `peppabot_redis_data`.
- Trate o backup de `PEPPABOT_APP_ENCRYPTION_KEY` separadamente do dump do
  banco; ambos sao necessarios para recuperar credenciais criptografadas.
