# Segurança

## Controles implementados

| Área | Controle | Onde |
|---|---|---|
| Login | Nome + senha **gerada** (16 caracteres aleatórios, ~79 bits); só o hash SHA-256 fica no Secret `USUARIOS`; comparação em tempo constante; mesma resposta para nome ou senha errados | `worker/login.ts`, `shared/credenciais.ts` |
| Sessão | JWT HS256 em cookie `__Host-sessao` (HttpOnly, Secure, SameSite=Strict), 8 h | `worker/sessao.ts` |
| Autorização | Usuário precisa estar em `USUARIOS` em **toda** requisição (revogação imediata) | `worker/auth.ts` (+ testes) |
| Força bruta | Senha de ~79 bits + login limitado por IP e por nome (10/min) + CSRF (Origin e header do app) | `worker/index.ts` |
| Dev | Login simulado só com `AMBIENTE=desenvolvimento` **e** host `localhost` | `worker/auth.ts` (+ testes) |
| CSRF | Exige `Origin` igual, `X-Requested-With` e `Content-Type: application/json` | `worker/index.ts` |
| Abuso/custo | Rate limiting por usuário (10/min), limites de tamanho, `max_output_tokens`, timeout | `wrangler.jsonc`, `worker/` |
| Validação | Entrada e saída validadas com zod (objetos estritos) | `shared/contrato.ts` |
| Segredos | `OPENAI_API_KEY`, `USUARIOS`, `SESSION_SECRET` só como Secret; `usuarios.local.json` (só hashes) fora do Git; `.dev.vars`/`.env` no `.gitignore` | — |
| Cache | `Cache-Control: no-store` em toda a API | `worker/index.ts` |
| Cabeçalhos | CSP restrita, HSTS, nosniff, Referrer-Policy, anti-clickjacking | `public/_headers` |
| XSS | Conteúdo de PDF/IA renderizado só como texto pelo React | `src/components/` |
| PDF.js | Versão 6 (sem caminho de `eval`), worker servido pelo próprio app, CSP sem `unsafe-eval` | `src/pdf/extrair.ts` |
| Prompt injection | Documentos delimitados e declarados não confiáveis; sem tools; JSON estrito; trechos conferidos no código | `worker/openai.ts`, `src/conferencia.ts` |
| Logs | Só `{evento, rota, codigo}`; invocation logs desligados | `worker/index.ts`, `wrangler.jsonc` |

## Checklist de implantação

- [ ] `npm run usuarios -- listar` mostra só as pessoas autorizadas; lista publicada ([docs/DEPLOY-TESTE.md](docs/DEPLOY-TESTE.md)).
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

- Prompt injection pode distorcer a análise (não executar ações). Mitigado pela conferência dos trechos; regras de valores ainda pendentes.
- A limpeza de memória no navegador é de melhor esforço.
- Sessões não podem ser derrubadas individualmente (sem banco): remover a pessoa da lista a bloqueia; trocar `SESSION_SECRET` derruba todos.
- Sem verificação em duas etapas (pode ser acrescentada com código de app autenticador) e sem “esqueci a senha” automático.
- Hash rápido (SHA-256) só é seguro porque as senhas são geradas e longas. Nunca aceitar senha escolhida por pessoa sem trocar para PBKDF2/Argon2.
- Arquivos estáticos (HTML/JS/CSS/logo) são acessíveis sem login; não contêm dados.
- Dados passam por Cloudflare e OpenAI (ver PRIVACY.md).

## Reportar problemas

Comunicar o responsável técnico diretamente. Não abrir issues públicas com detalhes.
