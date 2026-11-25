# Contexto do projeto

Plataforma **interna** da Special Imóveis para conferir **Recibos do Locatário × Extratos de Repasse** exportados do
sistema NIDO. A conferência roda **no navegador, com regras fixas e sem IA** (`src/nido/`); regras de negócio em
`docs/REGRAS-CONFERENCIA.md`. Toda a aplicação em **português brasileiro**.

## Regras inegociáveis

- **Sem banco de dados e sem persistência** de PDFs, textos, resultados ou histórico. Nada de D1, R2, KV, IndexedDB, localStorage, sessionStorage.
  **Exceções, no Supabase:** os represados (ver Decisões), só os dados lidos e só até concluir; e as contas de login
  (Supabase Auth: e-mail e hash da senha).
- **O PDF original nunca sai do navegador.** Só o texto extraído (por página) vai ao Worker.
- **Chave da OpenAI só como Secret** (`OPENAI_API_KEY`). Nunca no frontend, repositório ou logs.
- Chamadas à OpenAI sempre com `store: false`, sem tools, saída em JSON Schema estrito.
- **Logs só com categorias de erro.** Nunca corpo da requisição, texto, resposta da IA ou mensagens de exceção.
- Conteúdo de PDF e da IA é **não confiável**: renderizar só como texto (sem `dangerouslySetInnerHTML`, sem markdown).
- Autorização validada no Worker em toda requisição (cookie de sessão assinado + usuária ainda ativa no Supabase Auth).
- A IA não é autoridade: cálculos e conferências determinísticos ficam no código.
- Não inventar regras de negócio: perguntar.

## Decisões tomadas

- Stack: React + Vite + TypeScript, Cloudflare Worker com Static Assets (uma app, mesmo domínio).
- Autenticação (11/2026): **e-mail + senha no Supabase Auth** (mesmo projeto dos represados), conferidos pelo Worker
  (`worker/login.ts`, grant `password` com a chave secreta). A sessão do Supabase é descartada: o app cria o próprio
  JWT HS256 com o id da usuária no cookie `__Host-sessao` (HttpOnly, Secure, SameSite=Strict, 8 h), assinado com
  `SESSION_SECRET`. Em toda requisição o Worker consulta `auth/v1/admin/users/<id>` (`worker/auth.ts`): apagada ou
  bloqueada perde o acesso na hora; Supabase fora do ar = sem acesso. Usuárias criadas pelo administrador no painel
  (senha definida por ele, hash bcrypt do Supabase); **cadastro aberto desligado** no Supabase. Sem Google, Auth0 ou
  Cloudflare Access (o usuário não pode usar Zero Trust). Substituiu o login nome + senha gerada do Secret `USUARIOS`.
- Sem área admin no app: acessos gerenciados no painel do Supabase (Authentication → Users, vale na hora). Sem “esqueci a senha” automático; sem 2FA (pode ser acrescentado com TOTP).
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
  totais e impressão continuam com todos os contratos. Ela e a da lista da soma aceitam número do contrato ou nome
  do proprietário (com letras, busca no nome sem acento/maiúscula). As duas também têm um campo de valor (só os
  dígitos contam; nas tabelas de pagamento é o valor mostrado, já sem caução).
- Titular da conta na impressão (11/2026): o NIDO não tem campo de beneficiário; só na impressão, a "Descrição" do
  extrato (quando existe) vai em destaque na coluna Proprietário e o nome do proprietário fica menor embaixo. Na tela
  nada muda. Descrição só com símbolos (o NIDO traz "***" em cadastros sem observação) é ignorada.
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
- Crédito e débito na mesma linha (11/2026): o líquido manda (11039: IPTU em Contas PG Special é retido); "Taxa
  Expediente" sem "de" também fica retida (8867).
- Honorário judicial (11/2026): fica sempre com a Special (retido, como a taxa de expediente).
- Vários repasses na mesma competência (11/2026): só é duplicidade com o mesmo vencimento; vencimentos diferentes são
  boletos diferentes (inquilino que estava devendo, acordo: 14990).
- Aviso de versão nova (11/2026): a cada 30 s e ao voltar para a aba, o app compara o `/assets/index-*.js` do
  index.html do servidor com o carregado (`AvisoAtualizacao.tsx`) e mostra "Atualizar agora". Atualizar limpa a tela.
- Represados (11/2026): ~11 proprietários pedem para segurar os repasses. A lista de nomes fica no Supabase (tabela
  `represados_nomes`, editada no painel; nomes reais nunca no código). Ao "Conferir" (e "Analisar de novo"), o app
  separa **sozinho** os extratos desses proprietários e os recibos só deles (`separarRepresados`; recibo de contrato
  dividido com quem não é represado fica nos dois), guarda os dados lidos (nunca o PDF) na tabela `represados` e tira da
  conferência do dia. Se o banco falhar, a conferência não começa. Cópia idêntica não é guardada duas vezes. Projeto
  Supabase separado (usado só pelos represados e pelo login; o cron evita a pausa do plano grátis); todas as usuárias veem os mesmos. A página
  "Represados" não tem upload: lista cada nome com os dados guardados separados por contrato, e a conferência roda
  **um proprietário por vez** (nunca todos juntos); "Concluir e apagar do banco" apaga só os documentos daquele nome. Acesso só pelo Worker (`worker/represados.ts`, Secrets
  `SUPABASE_URL`/`SUPABASE_KEY`, chave `sb_secret_…` só no header `apikey`). RLS ligado sem políticas, sem permissão para
  `anon`/`authenticated`; o projeto não dá acesso automático às tabelas novas, então `service_role` recebe só o necessário
  (`supabase/represados.sql`). Cron a cada 3 dias lê a tabela para o Supabase grátis não pausar.
- Secrets por linha de comando (11/2026): gravar com `printf '%s' valor | npx wrangler secret put NOME` ou digitando no
  prompt; `"valor" | ...` no PowerShell acrescenta quebra de linha e quebrou a `SUPABASE_URL` (login e represados com erro 500).
- Testes usam só dados fictícios. **Nunca** versionar PDFs ou textos reais (têm CPF, nomes, contas).

## Pendências (aguardando o negócio)

- Juros de condomínio são repassados mas **não** entram na base da taxa ADM (hoje o código soma todos os juros):
  falta saber como a linha aparece no extrato e se a multa de condomínio segue a mesma regra. Perguntas para o
  financeiro em `docs/REGRAS-PARA-FINANCEIRO.md`.
- Gerar a remessa de pagamento do Itaú (SISPAG CNAB 240) com os repasses que bateram 100% e estão "AGUARDANDO
  EFETIVAÇÃO": pausado a pedido do negócio. Faltam: tabela nome do banco → código, origem do "seu número", formas de
  pagamento além de transferência, onde guardar os dados da conta da Special (Secret no Worker) e validar com o Itaú.

## Estrutura

- `src/` frontend (`pdf/extrair.ts` leitura local, `pdf/juntar.ts` Juntar PDF, `nido/ler.ts` + `nido/conferir.ts` conferência e totais, `api.ts`, `components/` com resultado e relatório em `Resultado.tsx`)
- `worker/` API (`auth.ts` sessão + usuária ativa no Supabase Auth, `login.ts` e-mail/senha no Supabase Auth, `represados.ts`, `sessao.ts` cookies assinados, `openai.ts`, `index.ts` rotas/validação/rate limit)
- `shared/` contrato, limites e `normalizarNome`
- `supabase/represados.sql` tabelas e permissões do Supabase (rodar no SQL Editor ou pelo MCP)

Atualize este arquivo e ARCHITECTURE/SECURITY/PRIVACY quando decisões mudarem.
