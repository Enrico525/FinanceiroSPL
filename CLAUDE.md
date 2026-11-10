# Contexto do projeto

Plataforma **interna** da Special Imóveis para conferir dois PDFs financeiros (Documento A e B) com IA.
Toda a aplicação em **português brasileiro**.

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

## Pendências (aguardando o negócio)

- Tipos dos documentos A/B e critérios de conferência → definem `ResultadoAnalise` e o prompt (marcados PROVISÓRIO).
- Conferência de valores em centavos (somas/totais) — depende das regras.
- Domínio próprio, modelo da OpenAI.
- OCR (Tesseract.js self-hosted) e divisão de documentos grandes — só após validar com documentos reais.

## Estrutura

- `src/` frontend (`pdf/extrair.ts` leitura local, `conferencia.ts`, `api.ts`, `components/`)
- `worker/` API (`auth.ts` sessão + lista, `login.ts` nome/senha, `sessao.ts` cookies assinados, `openai.ts`, `index.ts` rotas/validação/rate limit)
- `shared/` contrato e limites

Atualize este arquivo e ARCHITECTURE/SECURITY/PRIVACY quando decisões mudarem.
