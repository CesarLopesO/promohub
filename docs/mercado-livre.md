# Mercado Livre

Para converter links do Mercado Livre, o usuário precisa cadastrar no painel:

- a etiqueta/Affiliate ID;
- o cookie `ssid` de uma sessão já autenticada.

O SSID é armazenado criptografado, não é exibido depois de salvo e não deve
aparecer em logs.

## Modos

Configure `MERCADO_LIVRE_MODE`:

- `real` (padrão): usa `MERCADO_LIVRE_AFFILIATE_GENERATOR_URL`. Sem essa URL, o
  teste informa que o gerador real ainda não está configurado.
- `legacy`: adiciona `?aff_id=...` apenas para testes. Esse formato não garante
  comissão. O auto-forward continua bloqueado, salvo quando
  `MERCADO_LIVRE_LEGACY_FORWARD_ENABLED=true`.
- `disabled`: não altera links do Mercado Livre.

## Teste no painel

Abra `/dashboard/credentials`, salve a etiqueta e o SSID e use a área
**Testar conversão Mercado Livre**. Informe uma URL `meli.la` ou
`mercadolivre.com.br` para consultar a URL resolvida e o resultado da geração.
