# Regras de conferência do app

Versão para revisão do financeiro, de 16/11/2026. A versão técnica (com mais detalhes) está em
[REGRAS-CONFERENCIA.md](REGRAS-CONFERENCIA.md).

Este documento lista **todas as regras que o app confere hoje** entre o Recibo do Locatário e o Extrato de Repasse do NIDO. A conferência é feita por regras fixas, sem IA: o que não está aqui o app não confere.

Cada apontamento do app tem um de três níveis:

- **Divergência**: o app tem certeza de que algo está errado.
- **Conferência manual**: o app não consegue decidir sozinho (ex.: depende de um acordo que não aparece no PDF).
- **Aviso**: chama atenção, mas não impede o contrato de ficar ok.

**Como revisar:** leia cada seção e comente direto no texto quando uma regra estiver errada, incompleta ou faltando. As perguntas que ainda não têm resposta estão no fim.

## Arquivos e casamento recibo × extrato

Recibo e extrato são casados pelo **número do contrato + vencimento**. A data de pagamento pode variar.

**Arquivos**

- Os dois relatórios têm que ser **exportados direto do NIDO**. PDF gerado por “Imprimir → Microsoft Print to PDF” não tem texto e é recusado.
- Pode enviar vários arquivos de cada lado. O mesmo recibo ou extrato repetido em dois arquivos conta uma vez só.
- Extrato com o mesmo número de repasse e proprietário enviado de novo substitui o anterior (versão corrigida).
- Extrato já pago (“PAGAMENTO EFETUADO”) e ainda não pago (“AGUARDANDO EFETIVAÇÃO”) são conferidos do mesmo jeito.

**Quando falta um dos lados**

| Situação | O que o app mostra |
| --- | --- |
| Recibo sem nenhum extrato do contrato | “Recibo sem extrato”, em seção própria (pode ser só arquivo faltando) |
| Extrato sem nenhum recibo do contrato | “Extrato sem recibo”, em seção própria. Não vale para Aluguel Garantido e Pré-cadastro, em que isso é normal |
| Mesmo contrato, vencimentos diferentes no recibo e no extrato | Divergência |
| Mais de um recibo com o mesmo contrato e vencimento | Conferência manual |

## Situação do contrato

A situação vem do extrato e decide qual conferência o app faz. Situação fora desta lista vai inteira para conferência manual.

| Situação | O que o app faz |
| --- | --- |
| Normal | Conferência automática completa |
| IPTU PG Inquilino | Conferência automática completa |
| Aluguel Garantido | Conferência automática. Extrato sem recibo é normal |
| Cond. PG Inquilino | Conferência automática **e** conferência manual |
| Contas PG Special | Repassa só aluguel, multa, juros, abono e IRRF, descontando a taxa ADM. **Retém** todo o resto (condomínio, encargos, taxa de expediente, seguros, IPTU). Também vai para conferência manual |
| PRE-CADASTRO | Com recibo do mesmo proprietário, endereço e contrato: confere que tudo foi repassado **sem** taxa ADM e sem taxa de intermediação. Sem esse recibo: conferência manual |
| Jurídico | Só conferência manual, sem conferência automática |
| Qualquer outra | Só conferência manual |

## Taxa ADM e taxa de intermediação

Todo contrato com aluguel tem que descontar **uma** das duas: a taxa de intermediação (primeiro aluguel) ou a taxa ADM. Pré-cadastro não pode ter nenhuma.

**Taxa ADM**

```
Taxa ADM = (aluguel − abono + multa + juros) × percentual do extrato
```

- Arredondada para o centavo mais próximo, como o NIDO. Qualquer centavo de diferença é divergência.
- Taxa ADM ausente no extrato: divergência.
- Percentual não encontrado no extrato: conferência manual.
- Taxa ADM sem linha de aluguel (ex.: acordo, “Acordo ref. aos boletos Alugueis”): conferência manual.
- **Não entram na base:** “Aluguel Gerador” e manutenção (ex.: “Manutenção Elevador”).
- **Não diminui a base:** abono de benfeitoria (ex.: “Abono/ Benfeitoria 4/4”). A taxa vai sobre o aluguel cheio.
- **Taxa Adm aparecendo no recibo** (cobrada do inquilino): só é certa por acordo do contrato (ex.: 7840), que não aparece no PDF. Vai para conferência manual.

**Taxa de intermediação**

- O normal é **100% do aluguel**: o app dá como certo.
- Diferente de 100% (ex.: 50% no contrato 15215): varia conforme o acordo, vai para conferência manual.
- Com taxa de intermediação, a **multa não é repassada** ao proprietário. Multa repassada nesse caso é divergência.

## Repassado × retido

Cada linha do recibo é procurada no extrato pelo **valor exato e pelo sentido** (crédito ou débito ao proprietário). O que não está na lista de retidos tem que ser repassado.

| Lançamento | Regra | Se não bater |
| --- | --- | --- |
| Aluguel, condomínio, IPTU e demais cobranças | Repassados com o mesmo valor | Divergência |
| Multa e juros | Repassados (exceto com taxa de intermediação, em que a multa fica retida) | Divergência |
| Abono e IRRF | Crédito ao inquilino no recibo, débito ao proprietário no extrato | Divergência |
| Taxa de expediente, serviço despachante, taxa de assinatura digital, taxa de boleto, matrícula atualizada, boleto de caucionamento | Ficam retidos, não podem ir ao proprietário | Divergência |
| Seguros | Normalmente retidos | Seguro repassado vai para conferência manual (há casos em que é repassado) |
| Linha com “diferença” no histórico (ex.: “Diferença IRRF”) | Sem regra automática | Conferência manual |
| Taxa de repasse, taxa de renovação, vistoria | Descontos previstos ao proprietário, sem origem no recibo | Aceitos |
| Outro débito ao proprietário sem origem no recibo | — | Aviso |
| Crédito ao proprietário sem origem no recibo | — | Divergência |

## Valor pago, proprietários e totais

**Valor pago e duplicidade**

- Em cada extrato, créditos − débitos tem que ser igual ao valor pago ou a repassar ao proprietário. Diferença: divergência.
- **Grave:** mais de um repasse na mesma competência para o mesmo contrato e proprietário é divergência (repasse em dobro). No modo “Repasses únicos” só é detectado entre os extratos da mesma conferência.

**Vários proprietários no mesmo contrato**

- Com os extratos de todos os donos: as partes têm que somar o total da linha, com tolerância de 1 centavo por proprietário (arredondamento do NIDO).
- Só com parte dos donos: cada parte é conferida pelo percentual impresso, com tolerância de 0,005% do total + 1 centavo (o NIDO calcula 33,333…% e imprime 33,33%). Aparece um aviso.

**Totais do relatório**

- Somam só o valor pago ou a repassar de cada extrato, nunca os valores do recibo.
- **Depósito caução** nunca entra no total. Extrato só de caução fica fora da soma e aparece à parte.
- Extrato de **R$ 0,00** fica fora da soma, da contagem e do quadro “sem banco” (não há o que pagar).
- O mesmo extrato enviado em **duas versões diferentes** é divergência: troque pela versão certa.
- Conta de saída: repasse para **Bradesco** sai do Bradesco; para **qualquer outro banco** sai do **Itaú**.
- Extrato **sem banco** fica destacado até a pessoa escolher “Somar no Itaú” ou “Somar no Bradesco”.
- **Lançamento manual** (repasse feito por fora do NIDO): digitado no relatório com a conta, só soma no total, sem conferência.
- **Extrato excluído** pela pessoa: sai da soma e da análise, e o contrato some do relatório.
- Nada é guardado: escolhas, lançamentos manuais e exclusões valem só para aquela conferência.

## Perguntas para o financeiro

- [ ] **Juros de condomínio:** são repassados, mas não entram na base da taxa ADM. Hoje o app soma todos os juros na base. Como a linha aparece no extrato para separar juros de aluguel de juros de condomínio (ex.: “Juros Condomínio 09/2026”)?
- [ ] **Multa de condomínio:** segue a mesma regra dos juros (repassada, fora da base da taxa ADM)?
- [ ] **Falta alguma regra?** Algum lançamento que deveria ficar retido, algum desconto ao proprietário previsto ou alguma situação de contrato que não está nas tabelas acima?
- [ ] **Alguma regra está errada?** Comente direto na linha da tabela.
