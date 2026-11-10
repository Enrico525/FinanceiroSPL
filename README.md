# Conferência Financeira — Special Imóveis

Ferramenta interna para conferir dois documentos financeiros em PDF com auxílio de IA.
Os PDFs são lidos **no navegador**; apenas o texto extraído é enviado para análise. Nada é armazenado.

> Status: **esqueleto**. Regras de conferência, OCR e divisão de documentos grandes ainda não foram definidas.

## Requisitos

- Node.js 22+ (testado com 24)
- Conta Cloudflare (Workers; plano gratuito serve para testes)
- Projeto na OpenAI com chave dedicada e limite de gasto

## Desenvolvimento local

```bash
npm install
cp .env.example .dev.vars   # preencha OPENAI_MODEL e uma chave de DESENVOLVIMENTO
npm run cf-typegen          # gera worker-configuration.d.ts
npm run dev
```

Em `localhost`, com `AMBIENTE=desenvolvimento`, o login é simulado pelo `DEV_EMAIL`.
Use apenas documentos **fictícios ou anonimizados**.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Vite + Worker no runtime local |
| `npm test` | Testes unitários (Vitest) |
| `npm run typecheck` | Checagem de tipos |
| `npm run build` | Build de produção |
| `npm run deploy` | Typecheck + testes + build + `wrangler deploy` |

## Deploy de teste

Passo a passo em [docs/DEPLOY-TESTE.md](docs/DEPLOY-TESTE.md): chave de sessão, cadastro de
usuários (`npm run usuarios`), publicação e verificação. Checklist de segurança em
[SECURITY.md](SECURITY.md#checklist-de-implantação).

Documentação: [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md)
