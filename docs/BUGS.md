# Bugs e pontos de atenção (achados em 26/11/2026, a decidir)

Lista para ver depois. Nada aqui foi corrigido.

## Bug

1. **"Concluir e apagar do banco" apaga também o extrato tirado da análise.**
   Na página Represados, se a pessoa clica em "Remover extrato … desta análise" e depois em Concluir, o extrato
   removido também é apagado do banco, sem ter sido conferido. O repasse segurado se perde.
   Causa: `concluirRepresados` (`src/App.tsx`) apaga todos os `usados` da caixa, sem descontar os `removidos`.
   Correção proposta: apagar só o que ficou na conferência e deixar o removido guardado.

## Pontos de atenção (não são erro hoje)

2. **Caixa certa depende do que está guardado.** `caixaDoExtrato` escolhe a caixa pelos extratos guardados do mesmo
   contrato. Contrato do tio com os sobrinhos em que só o extrato de um sobrinho foi guardado cai em
   "Teixeira sobrinhos"; se depois chegar o do tio, os dois vão para "Teixeira".
3. **Log: `guardado_por` no "apagou"** mostra quem guardou o documento, não quem concluiu (o Worker não manda a
   usuária no DELETE).
4. **Limite do corpo no Worker** (`lerCorpo`, `worker/index.ts`) compara caracteres com um limite em bytes; com
   acentos, passa um pouco mais que 4 MB. Sem risco real.
