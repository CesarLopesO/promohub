# Billing Asaas

O checkout flexível cria assinaturas Asaas com `cycle: MONTHLY` e `billingType: UNDEFINED`, permitindo que o cliente escolha o método de pagamento na tela hospedada do Asaas.

Para cartão recorrente, o PeppaBot cria um Asaas Checkout hospedado com
`billingTypes: ["CREDIT_CARD"]`, `chargeTypes: ["RECURRENT"]` e ciclo
`MONTHLY`. Os dados do cartão são informados diretamente ao Asaas e nunca
trafegam nem são armazenados pelo PeppaBot.
