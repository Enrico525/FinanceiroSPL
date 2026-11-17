# Contexto do projeto

Plataforma **interna** da Special Imóveis para conferir **Recibos do Locatário × Extratos de Repasse** exportados do
sistema NIDO. A conferência roda **no navegador, com regras fixas e sem IA** (`src/nido/`); regras de negócio em
`docs/REGRAS-CONFERENCIA.md`. Toda a aplicação em **português brasileiro**.

## Regras inegociáveis

- **Sem banco de dados e sem persistência** de PDFs, textos, resultados ou histórico. Nada de D1, R2, KV, IndexedDB, localStorage, sessionStorage.
- **O PDF original nunca sai do navegador.** Só o texto extraído (por página) vai ao Worker.
- **Chave da OpenAI só como Secret** (`OPENAI_API_KEY`). Nunca no frontend, repositório ou logs.
- Chamadas à OpenAI sempre com `store: false`, sem tools, saída em JSON Schema estrito.
- **Logs só com categorias de erro.** Nunca corpo da requisição, texto, resposta da IA ou mensagens de exceção.
- Conteúdo de PDF e da IA é **não confiável**: renderizar só como texto (sem `dangerouslySetInnerHTML`, sem markdown).
- Autorização validada no Worker em toda requisição (cookie de sessão assinado + usuário ainda cadastrado em `USUARIOS`).
- A IA não é autoridade: cálculos e conferências determinísticos ficam no código.
- Não inventar regras de negócio: perguntar.

## Decisões tomadas

- Stack: React + Vite + TypeScript, Cloudflare Worker com Static Assets (uma app, mesmo domínio).
- Autenticação: **nome + senha gerada** pelo administrador, feita pelo próprio Worker (`worker/login.ts`). Sem Google, Auth0 ou Cloudflare Access (o usuário não pode usar Zero Trust). Senhas são aleatórias (16 caracteres, ~79 bits, `shared/credenciais.ts`), por isso SHA-256 simples basta — **nunca permitir senha escolhida por pessoa sem trocar para hash lento**. Lista `nome → hash` no Secret `USUARIOS`, gerida por `npm run usuarios` (`scripts/usuarios.ts`; arquivo local `usuarios.local.json` fora do Git). Sessão = JWT HS256 em cookie `__Host-sessao` (HttpOnly, Secure, SameSite=Strict, 8 h), assinado com `SESSION_SECRET`.
- Sem área admin no app: acessos gerenciados pelo script + `publicar` (vale na hora). Sem “esqueci a senha” automático; sem 2FA (pode ser acrescentado com TOTP).
- Assets estáticos são públicos (não contêm dados); só a API exige login.
- Contrato frontend↔Worker em `shared/contrato.ts` (zod). O mesmo schema vira o JSON Schema enviado à OpenAI.
- Conferência de referências: todo `trecho_literal` citado pela IA é procurado na página indicada (`src/conferencia.ts`).

- Conferência NIDO (11/2026): os PDFs do NIDO têm layout fixo, então a leitura (`src/nido/ler.ts`) e as regras
  (`src/nido/conferir.ts`) são determinísticas, em centavos inteiros. A IA foi dispensada; `worker/openai.ts` e
  `/api/analisar` continuam no Worker sem uso pelo app.
- Rota OpenAI (11/2026): fica no Worker, sem uso por enquanto; não remover sem o negócio pedir.
- Hospedagem (11/2026): segue no `*.workers.dev` da Cloudflare, sem domínio próprio (uso temporário).
- PDF gerado por "Imprimir → Microsoft Print to PDF" não tem texto (letras viram desenho): o app recusa e pede o
  relatório exportado direto do NIDO. OCR não é necessário.
- Juntar PDF (11/2026): página que junta vários Extratos de Repasse num PDF só (`src/pdf/juntar.ts`, pdf-lib,
  copiando as páginas originais) e só **baixa** o arquivo para o computador; o app lê esse PDF como qualquer outro.
  Lateral com 3 páginas: Juntar PDF, Repasses únicos (modo "um") e Repasses juntados (modo "geral").
- Lançamentos manuais (11/2026): repasses feitos por fora do NIDO (sem extrato) são digitados no relatório, com a
  conta (Itaú/Bradesco); só somam nos totais, sem conferência, e ficam só em memória.
- Dados bancários no relatório (11/2026): CPF/CNPJ, forma, banco, agência, conta, tipo e descrição do cabeçalho do
  extrato aparecem em cada contrato do relatório (tela e impressão), só como texto e só em memória.
- Relatório de repasses (11/2026): é para pagar, não para conferir. Uma tabela por conta de saída (Itaú, Bradesco,
  sem banco) com contrato, proprietário + CPF/CNPJ, dados bancários e valor, em destaque; sem a lista de
  apontamentos e conferidos (ficam na tela de resultado). Recibo sem extrato e extrato só de caução ficam fora.
- Extrato excluído pela pessoa (11/2026): o contrato sai do resultado e do relatório, em vez de virar "recibo sem
  extrato" (`conferirSem`).
- Taxa de intermediação (11/2026): o normal é 100% do aluguel, mas varia conforme o acordo (fora do PDF); diferente
  de 100% continua indo para conferência manual.
- Taxa Adm no recibo (11/2026): só é certa por acordo do contrato (ex.: 7840), então vira conferência manual.
- Juros (11/2026): são cobrados só sobre o aluguel e entram na base da taxa ADM, junto com a multa.
- Depósito caução (11/2026): a linha "Depósito Caução" do extrato nunca soma nos totais do relatório (`totais`);
  a conferência do contrato não muda.
- Pesquisa de contrato nas tabelas de pagamento do relatório (11/2026): só esconde na tela (`oculto-na-tela`);
  totais e impressão continuam com todos os contratos.
- Extrato em duas versões (11/2026): mesmo número e proprietário com conteúdo diferente é divergência (antes o
  primeiro ficava em silêncio); cópia idêntica continua contando uma vez.
- Taxa ADM sem linha "Aluguel" (acordos, 11/2026): conferência manual, sem calcular a base.
- Troca de conta à mão (11/2026): na tabela de pagamentos, qualquer repasse (mesmo com banco no extrato) pode ser
  mudado de conta ("Pagar pelo Itaú/Bradesco"); usa as mesmas `escolhas` do "sem banco" (`contaDoRepasse`), só em
  memória, e a impressão mostra "Conta trocada à mão". (Criada para o 14481, que no fim estava certo: contrato
  dividido, uma metade em cada banco.)
- Dupla checagem da soma (11/2026): ao ler um PDF de extratos, o app conta os extratos direto do texto
  ("Total Pendente Contrato N", `extratosNaoLidos`) e **recusa o arquivo** se não bater com o que foi lido (extrato
  sem ler some da soma em silêncio; o `extrato-de-repasse-8.pdf` antigo cai nisso). No relatório, extrato com valor
  diferente da soma das linhas aparece em vermelho no topo (bloco `Barrados`), mesmo sem recibo.
- Lotes anteriores já pagos (11/2026): campo opcional com os PDFs dos lotes já pagos, só em memória. Extrato com o
  mesmo número e proprietário de um lote anterior (`jaPagosAntes`) sai da soma e aparece em vermelho no topo até a
  pessoa liberar. Caso real: 14793 baixado de novo em 17/11 porque o lote de 16/11 ficou aberto no NIDO.
- Extrato de R$ 0,00 (11/2026): fora da soma, da contagem e do quadro "sem banco", como o só de caução.
- Linhas iguais no mesmo extrato (11/2026): dois lançamentos com o mesmo histórico e valor (ex.: dois "Condomínio")
  são lançamentos distintos, não partes de proprietários diferentes (antes viravam divergência falsa).
- Testes usam só dados fictícios. **Nunca** versionar PDFs ou textos reais (têm CPF, nomes, contas).

## Pendências (aguardando o negócio)

- Validar com um par recibo × extrato do mesmo lote. Lote de 13/11/2026: leitura ok em todos os PDFs, mas os extratos
  cobriam só 2 de 47 contratos (14756 bateu inteiro; no 15215 a divergência do "Condomínio Prop" não repassado era
  erro real, confirmado e corrigido pelo financeiro). Lote de 16/11/2026: 42 extratos lidos, valores iguais ao
  "Total Pendente" de cada página, e a soma do Itaú bateu com a soma manual do financeiro depois de tirar um extrato
  e digitar 4 lançamentos manuais; as divergências desse lote ainda não foram revisadas com o financeiro.
  Lote de 17/11/2026: 192 páginas de extrato (191 extratos; o 14881 veio repetido), soma R$ 818.870,23 com o 7159
  corrigido. A fita do financeiro (soma de telas do NIDO, 192 repasses) deu R$ 852.547,55, ~R$ 31,6 mil a mais:
  diferença ainda sem explicação, falta a lista do NIDO com contrato e valor para comparar.
  Soma manual do financeiro no mesmo lote: R$ 812.148,37 (Bradesco 291.486,89, Itaú 520.661,48). Fechou com o app
  tirando o 14793 (R$ 6.721,86, confirmado pelo financeiro); o erro de banco era da soma manual (14481 Bradesco
  somado no Itaú). Certo: Bradesco 301.576,14, Itaú 510.572,23.

- Juros de condomínio são repassados mas **não** entram na base da taxa ADM (hoje o código soma todos os juros):
  falta saber como a linha aparece no extrato e se a multa de condomínio segue a mesma regra. Perguntas para o
  financeiro em `docs/REGRAS-PARA-FINANCEIRO.md`.
- Gerar a remessa de pagamento do Itaú (SISPAG CNAB 240) com os repasses que bateram 100% e estão "AGUARDANDO
  EFETIVAÇÃO": pausado a pedido do negócio. Faltam: tabela nome do banco → código, origem do "seu número", formas de
  pagamento além de transferência, onde guardar os dados da conta da Special (Secret no Worker) e validar com o Itaú.

## Estrutura

- `src/` frontend (`pdf/extrair.ts` leitura local, `pdf/juntar.ts` Juntar PDF, `nido/ler.ts` + `nido/conferir.ts` conferência e totais, `api.ts`, `components/` com resultado e relatório em `Resultado.tsx`)
- `worker/` API (`auth.ts` sessão + lista, `login.ts` nome/senha, `sessao.ts` cookies assinados, `openai.ts`, `index.ts` rotas/validação/rate limit)
- `shared/` contrato e limites

Atualize este arquivo e ARCHITECTURE/SECURITY/PRIVACY quando decisões mudarem.
