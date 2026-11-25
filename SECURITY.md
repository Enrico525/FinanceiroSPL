# Segurança

## Controles implementados

| Área | Controle | Onde |
|---|---|---|
| Login | E-mail + senha conferidos no Supabase Auth pelo Worker (chave secreta só no Worker; senha com bcrypt no Supabase); mesma resposta para e-mail ou senha errados; cadastro aberto desligado no Supabase | `worker/login.ts` |
| Sessão | JWT HS256 em cookie `__Host-sessao` (HttpOnly, Secure, SameSite=Strict), 8 h | `worker/sessao.ts` |
| Autorização | Usuária precisa existir e não estar bloqueada no Supabase Auth em **toda** requisição (revogação imediata; Supabase fora do ar = sem acesso) | `worker/auth.ts` (+ testes) |
| Força bruta | Login limitado por IP e por e-mail (10/min) + limite do próprio Supabase Auth + CSRF (Origin e header do app) | `worker/index.ts`, `worker/login.ts` |
| Dev | Login simulado só com `AMBIENTE=desenvolvimento` **e** host `localhost` | `worker/auth.ts` (+ testes) |
| CSRF | Exige `Origin` igual, `X-Requested-With` e `Content-Type: application/json` | `worker/index.ts` |
| Abuso/custo | Rate limiting por usuário (10/min), limites de tamanho, `max_output_tokens`, timeout | `wrangler.jsonc`, `worker/` |
| Validação | Entrada e saída validadas com zod (objetos estritos) | `shared/contrato.ts` |
| Segredos | `OPENAI_API_KEY`, `SESSION_SECRET`, `SUPABASE_KEY` só como Secret; `.dev.vars`/`.env` no `.gitignore` | — |
| Cache | `Cache-Control: no-store` em toda a API | `worker/index.ts` |
| Cabeçalhos | CSP restrita, HSTS, nosniff, Referrer-Policy, anti-clickjacking | `public/_headers` |
| XSS | Conteúdo de PDF/IA renderizado só como texto pelo React | `src/components/` |
| PDF.js | Versão 6 (sem caminho de `eval`), worker servido pelo próprio app, CSP sem `unsafe-eval` | `src/pdf/extrair.ts` |
| Prompt injection | A conferência não usa IA (regras em `src/nido/conferir.ts`). A rota OpenAI, ainda existente, mantém documentos delimitados e não confiáveis, sem tools e com JSON estrito | `worker/openai.ts` |
| Logs | Só `{evento, rota, codigo}`; invocation logs desligados | `worker/index.ts`, `wrangler.jsonc` |

## Checklist de implantação

- [ ] Represados: rodar `supabase/represados.sql` no projeto Supabase e gravar `SUPABASE_URL` e `SUPABASE_KEY` com `npx wrangler secret put`.

- [ ] Supabase → Authentication → Users mostra só as pessoas autorizadas, e *Allow new users to sign up* está desligado.
- [ ] Senhas entregues por canal privado; ninguém compartilha a própria senha.
- [ ] `SESSION_SECRET` (≥ 32 caracteres aleatórios) via `wrangler secret put`.
- [ ] Sem login, `/api/eu` retorna 401; senha errada é recusada.
- [ ] `preview_urls: false`.
- [ ] `OPENAI_API_KEY` via `wrangler secret put`; projeto OpenAI com limite de gasto.
- [ ] Workers Logs/Logpush revisados: nenhum conteúdo de documento.
- [ ] WAF *payload logging* desabilitado para este domínio.
- [ ] Nenhum analytics/RUM que capture conteúdo da página.
- [ ] `npm audit` sem vulnerabilidades altas.

## Riscos conhecidos

- Represados no Supabase: CPF/CNPJ e dados bancários ficam guardados até a conclusão. Mitigação: só o Worker acessa (Secret `SUPABASE_KEY`, nunca no navegador), RLS sem políticas para `anon`/`authenticated`, dados validados (zod) antes de gravar, apagados ao concluir. Quem tiver a chave secreta lê tudo: guardar só como Secret.

- A conferência não usa IA. A rota OpenAI, sem uso pelo app, continua sujeita a prompt injection se voltar a ser usada.
- O relatório (tela e impressão) mostra CPF/CNPJ e dados bancários dos proprietários. O app não guarda nada, mas o
  PDF impresso ou salvo fica com o usuário: tratar como documento sigiloso.
- A limpeza de memória no navegador é de melhor esforço.
- Sessões não podem ser derrubadas individualmente (sem banco): remover a pessoa da lista a bloqueia; trocar `SESSION_SECRET` derruba todos.
- Sem verificação em duas etapas (pode ser acrescentada com código de app autenticador) e sem “esqueci a senha” automático.
- Hash rápido (SHA-256) só é seguro porque as senhas são geradas e longas. Nunca aceitar senha escolhida por pessoa sem trocar para PBKDF2/Argon2.
- Arquivos estáticos (HTML/JS/CSS/logo) são acessíveis sem login; não contêm dados.
- O login e o site passam pela Cloudflare; os documentos não saem do navegador (ver PRIVACY.md).

## Reportar problemas

Comunicar o responsável técnico diretamente. Não abrir issues públicas com detalhes.
