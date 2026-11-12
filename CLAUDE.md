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
- Testes usam só dados fictícios. **Nunca** versionar PDFs ou textos reais (têm CPF, nomes, contas).

## Pendências (aguardando o negócio)

- Validar com um par recibo × extrato do mesmo lote (os exemplos recebidos eram de lotes diferentes).
- "Taxa Adm" aparecendo no **recibo** (ex.: contrato 7840): regra não definida.
- Juros entram na base da taxa ADM? Ainda não apareceu caso real.

## Estrutura

- `src/` frontend (`pdf/extrair.ts` leitura local, `nido/ler.ts` + `nido/conferir.ts` conferência, `api.ts`, `components/`)
- `worker/` API (`auth.ts` sessão + lista, `login.ts` nome/senha, `sessao.ts` cookies assinados, `openai.ts`, `index.ts` rotas/validação/rate limit)
- `shared/` contrato e limites

Atualize este arquivo e ARCHITECTURE/SECURITY/PRIVACY quando decisões mudarem.
