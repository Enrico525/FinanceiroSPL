# Arquitetura

```
Navegador (React)
  ├─ Tela de login: nome + senha (sem sessão)
  ├─ PDF.js (worker servido pelo app) → texto por página
  ├─ src/nido/ler.ts: lê Recibos do Locatário e Extratos de Repasse do NIDO
  ├─ src/nido/conferir.ts: regras de conferência (docs/REGRAS-CONFERENCIA.md), sem IA
  └─ Estado apenas em memória
        │ HTTPS · só login/sessão (a conferência não envia dados)
        ▼
Cloudflare Worker (Static Assets + /api/* + /auth/*)
  ├─ /auth/*: login por nome + senha (hash no Secret USUARIOS), sessão em cookie assinado
  ├─ Em toda chamada /api: valida cookie (HS256) + usuário ainda em USUARIOS
  ├─ CSRF: Origin + X-Requested-With + Content-Type JSON
  ├─ Rate limiting (por usuário na API; por IP e por nome no login)
  ├─ Valida corpo (zod, limites de páginas/caracteres)
  └─ OpenAI Responses API (store:false, JSON Schema estrito, timeout 120 s)
        ▼
OpenAI
```

## Endpoints

| Rota | Método | Descrição |
|---|---|---|
| `/auth/entrar` | POST | `{ nome, senha }` → cria a sessão (8 h). Erro igual para nome ou senha errados |
| `/auth/sair` | POST | Apaga a sessão |
| `/api/eu` | GET | Nome do usuário autenticado |
| `/api/analisar` | POST | Recebe `PedidoAnalise`, devolve `ResultadoAnalise` |

Erros da API: `{ "erro": CodigoErro }` (ver `shared/contrato.ts`). O frontend traduz para pt-BR.

## Autenticação sem banco de dados

- **Credencial:** senha aleatória gerada pelo administrador (`npm run usuarios`); só o hash SHA-256 vai para o Secret `USUARIOS`.
- **Autorização:** o usuário precisa continuar em `USUARIOS` em toda requisição.
- **Sessão:** JWT HS256 no cookie `__Host-sessao` (HttpOnly, Secure, SameSite=Strict), assinado com o Secret `SESSION_SECRET`. Expira em 8 h.
- **Revogação:** `npm run usuarios -- remover` + `publicar` (imediato) ou trocar `SESSION_SECRET` (derruba todos).
- Os arquivos estáticos (HTML/JS/CSS/logo) são públicos e não contêm dados; tudo que tem dado passa pela API.

## Fluxo da conferência (todo no navegador)

1. Usuário adiciona PDFs de recibos e de extratos → `lerPdf` valida tamanho, assinatura `%PDF-`, senha, corrupção,
   nº de páginas e extrai texto.
2. PDF sem texto (impresso via “Microsoft Print to PDF”) é recusado: o relatório precisa ser exportado do NIDO.
3. `lerRecibos`/`lerRepasses` transformam o texto em registros; arquivo sem nenhum registro é recusado.
4. `conferir` casa recibo × extrato por contrato + vencimento e aplica as regras (valores em centavos).
5. Os registros lidos são descartados; só o resultado fica na tela até "Nova conferência" ou saída da página.

A rota `/api/analisar` (OpenAI) continua no Worker, mas o app não a usa mais.

## Limites (provisórios, `shared/contrato.ts`)

20 MB por arquivo · 200 páginas por documento · 400.000 caracteres no total · corpo até 4 MB.

## Ambientes

- **Desenvolvimento:** `npm run dev` + `.dev.vars` (login simulado só em localhost).
- **Teste/produção:** `*.workers.dev` (depois domínio próprio), variáveis em `wrangler.jsonc`, segredos como Secret.

## Ainda não implementado

- Divisão de documentos grandes em várias etapas (coordenada pelo navegador, Worker sem estado).
- OCR local.
