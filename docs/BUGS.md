# Bugs e pontos de atenção (achados em 26/11/2026, a decidir)

Lista para ver depois. Nada aqui foi corrigido.

## Pontos de atenção (não são erro hoje)

1. **Caixa certa depende do que está guardado.** `caixaDoExtrato` escolhe a caixa pelos extratos guardados do mesmo
   contrato. Contrato do tio com os sobrinhos em que só o extrato de um sobrinho foi guardado cai em
   "Teixeira sobrinhos"; se depois chegar o do tio, os dois vão para "Teixeira".
2. **Log: `guardado_por` no "apagou"** mostra quem guardou o documento, não quem concluiu (o Worker não manda a
   usuária no DELETE).
