# Regras de conferência — Recibo do Locatário × Extrato de Repasse

Regras definidas com o financeiro e aplicadas pelo código em `src/nido/conferir.ts`, sem IA.
Cada regra tem teste em `src/nido/conferir.test.ts`. Qualquer mudança aqui precisa mudar o código e o teste.

## Arquivos

- Os dois relatórios devem ser **exportados direto do NIDO**. PDF gerado por “Imprimir → Microsoft Print to PDF”
  não tem texto e é recusado.
- Pode enviar vários arquivos de cada lado. O mesmo recibo/extrato repetido em dois arquivos conta uma vez só.
- Dois modos:
  - **Conferência geral:** todos os recibos × todos os extratos de uma vez.
  - **Extratos separados:** os recibos ficam carregados; envie um ou vários extratos (ex.: um PDF por contrato),
    confira e envie os próximos. "Recibos sem extrato" não aparece (seria todo o resto). Repasse em dobro só é
    detectado entre os extratos da mesma conferência, porque nada é guardado entre conferências.
- Extrato com "PAGAMENTO AGUARDANDO EFETIVAÇÃO" (repasse ainda não pago) é conferido igual ao já pago.

## Como os documentos são casados

- Recibo e extrato são casados por **número do contrato + vencimento** (o vencimento tem que ser o mesmo; a data de
  pagamento pode variar).
- Um contrato com vários proprietários tem um extrato por proprietário; eles são conferidos juntos.

## Situação do contrato (vem do extrato)

| Situação | O que o app faz |
|---|---|
| Normal | Conferência automática completa |
| IPTU PG Inquilino | Conferência automática completa (só retém a taxa ADM) |
| Aluguel Garantido | Conferência automática; extrato **sem** recibo é normal |
| Cond. PG Inquilino | Conferência automática **e** separa para conferência manual |
| Contas PG Special | Repassa aluguel, multa e IRRF descontando a taxa ADM; **retém** condomínio, encargos, taxa de expediente, seguros e IPTU. Também separa para conferência manual |
| PRE-CADASTRO | Se houver recibo com mesmo proprietário, endereço e contrato: confere que tudo foi repassado **sem** taxa ADM. Sem isso: conferência manual |
| Jurídico | Só separa para conferência manual |
| Qualquer outra | Conferência manual |

## Regras de valores (em centavos; qualquer centavo de diferença é divergência)

- Tudo o que o inquilino pagou e pertence ao proprietário tem que aparecer no extrato, com o mesmo valor.
- **Taxa ADM** = (aluguel − abono + multa) × percentual do extrato, arredondada. Ausente ou diferente: divergência.
  **Aluguel Gerador** e **manutenção** (ex.: "Manutenção Elevador") **não entram** na base. **Abono de benfeitoria**
  (ex.: "Abono/ Benfeitoria 4/4") **não diminui** a base: a taxa vai sobre o aluguel cheio.
- **Taxa de intermediação** (primeiro aluguel): deve ser 100% do aluguel; se for diferente, conferência manual.
  Nesse caso a **multa não é repassada**.
- **Abono e IRRF**: crédito ao inquilino no recibo, débito ao proprietário no extrato.
- **Multa e juros**: repassados ao proprietário (exceto com taxa de intermediação).
- **Ficam retidos** (não podem aparecer como crédito ao proprietário): taxa de expediente, serviço (de) despachante (ex.: "Serviço Despachante Enel/Sabesp"),
  taxa de assinatura digital, taxa de boleto, matrícula atualizada, boleto de caucionamento e seguros.
  Seguro repassado vai para conferência manual (há casos em que é repassado).
- **Descontos previstos ao proprietário**: taxa de repasse, taxa de renovação e vistoria.
  Outros débitos ao proprietário sem origem no recibo aparecem como aviso.
- Lançamento com **“diferença”** no histórico vai para conferência manual.
- **Vários proprietários**: com os extratos de todos os donos, as partes devem somar o total, com tolerância de
  1 centavo por proprietário (arredondamento do NIDO). Se só parte dos donos foi enviada, cada parte é conferida pelo
  percentual impresso, com tolerância de 0,005% do total + 1 centavo (o NIDO calcula 33,333…% e imprime 33,33%).
- Créditos − débitos de cada extrato devem ser iguais ao valor pago ao proprietário.
- **Grave:** mais de um repasse na mesma competência para o mesmo contrato e proprietário.
- Recibo sem extrato, ou extrato sem recibo (fora Aluguel Garantido e Pré-cadastro), aparece em seção própria
  ("Recibos sem extrato de repasse" / "Extratos sem recibo"), separada das divergências: pode ser só arquivo faltando.
  Mesmo contrato com vencimento diferente continua sendo divergência.

## Totais do relatório

- Soma só os **repasses** (valor pago/a repassar de cada extrato), nunca os valores do recibo.
- Separada pela conta de onde sai a transferência: repasse para **Bradesco** sai do Bradesco; para **qualquer outro
  banco** (Itaú, Banco do Brasil, Inter, Santander…) sai do **Itaú**.
- Extrato **sem banco**: fica em linha à parte, destacada, até a pessoa escolher no relatório "Somar no Itaú" ou
  "Somar no Bradesco" para cada repasse. A escolha vale só para aquela conferência (nada é guardado).
