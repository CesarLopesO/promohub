# Worker WhatsApp: inicio da Fase 2

O workspace `apps/worker` estabelece o processo dedicado que recebera o
runtime WhatsApp nas proximas etapas. Neste momento ele apenas:

- registra um `WorkerNode` no PostgreSQL;
- atualiza `lastHeartbeatAt` periodicamente;
- publica os logs de inicio, heartbeat e parada;
- define nomes de filas e contratos TypeScript para jobs futuros.

Ele consome somente comandos de sessao em modo dry-run. Os processors validam
e registram o recebimento, mas nao adquirem leases de sessoes, nao importam
Baileys e nao abrem sockets WhatsApp. A API continua operando em:

```dotenv
WHATSAPP_RUNTIME_MODE=embedded
WHATSAPP_QUEUE_COMMANDS_ENABLED=false
```

## Execucao local

Suba PostgreSQL e Redis e garanta que as migrations estejam aplicadas:

```bash
npm run dev:infra
npm run db:migrate
```

Execute o worker com um nome diferente do worker embedded da API:

```bash
WORKER_NAME=whatsapp-worker-local \
WORKER_MAX_SESSIONS=25 \
npm run dev:worker
```

O processo deve emitir:

```text
[WORKER] started name=whatsapp-worker-local
[WORKER] heartbeat name=whatsapp-worker-local
```

Ao receber `SIGINT` ou `SIGTERM`, o registro passa para `STOPPED`:

```text
[WORKER] stopped name=whatsapp-worker-local
```

## Contratos de fila

Os contratos iniciais ficam em:

- `apps/worker/src/queues/queue-names.ts`
- `apps/worker/src/queues/job-contracts.ts`

Os comandos de sessao usam BullMQ e Redis. A API so publica quando
`WHATSAPP_QUEUE_COMMANDS_ENABLED=true`; por padrao, o fluxo embedded nao
depende das filas. Os consumers do worker sao dry-run e nenhuma sessao real e
alterada.

## Docker Compose

O servico `worker` usa o profile `future-worker`. Por isso, o comando normal:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d
```

nao inicia o worker dedicado. Para testar somente o registro e heartbeat:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml --profile future-worker up -d worker
```

Esse profile nao deve ser habilitado como runtime WhatsApp de producao nesta
etapa. Mesmo quando iniciado, o worker permanece sem ownership de sessoes.
