# Conferência Financeira — Special Imóveis

Ferramenta interna para conferir os **Recibos do Locatário** contra os **Extratos de Repasse** exportados do NIDO.
Os PDFs são lidos e conferidos **no navegador**: nada é enviado nem armazenado.

**Endereço:** <https://financeirospl.specialimoveis.workers.dev> (acesso só com nome e senha cadastrados)

> **Status:** em teste. Regras de conferência em [docs/REGRAS-CONFERENCIA.md](docs/REGRAS-CONFERENCIA.md).
> Falta validar com um par de recibos e extratos do mesmo lote.

## Como funciona

1. A pessoa entra com **nome + senha** (senha gerada pelo administrador).
2. Adiciona os PDFs de **Recibo do Locatário** e de **Extrato de Repasse**, exportados direto do NIDO
   (não use “Imprimir”: esse PDF não tem texto). Pode ser mais de um arquivo de cada lado.
3. O navegador lê os relatórios e aplica as regras. Nenhum dado sai do computador.
4. O resultado mostra as **divergências**, os casos para **conferência manual** e os contratos sem divergência,
   com o arquivo e a página de cada um.
5. “Nova conferência”, “Sair” ou fechar a página apagam tudo. Não há histórico.

## Gerenciar acessos

```bash
npm run usuarios -- ajuda
```

| Situação | Comando |
|---|---|
| Nova pessoa | `npm run usuarios -- adicionar "Nome Sobrenome"` |
| Esqueceu a senha | `npm run usuarios -- nova-senha "Nome Sobrenome"` |
| Tirar o acesso | `npm run usuarios -- remover "Nome Sobrenome"` |
| Ver quem tem acesso | `npm run usuarios -- listar` |
| **Aplicar as mudanças** | `npm run usuarios -- publicar` (vale na hora) |

- A senha aparece **uma única vez**: entregue em particular e peça que a pessoa salve no navegador.
- `usuarios.local.json` guarda só nomes e hashes (nunca senhas) e fica fora do Git. Faça uma cópia de segurança.
- Cabem cerca de 50 usuários. A sessão dura 8 horas.

## Requisitos

- Node.js 22+ (testado com 24)
- Conta Cloudflare (Workers; plano gratuito serve para testes)
- Para a análise: projeto na OpenAI com chave dedicada e limite de gasto

## Desenvolvimento local

```bash
npm install
```

```bash
cp .env.example .dev.vars
```

```bash
npm run dev
```

Em `localhost`, com `AMBIENTE=desenvolvimento` e `DEV_EMAIL` preenchido, o login é simulado.
Para testar o login real localmente, veja [docs/DEPLOY-TESTE.md](docs/DEPLOY-TESTE.md#testar-o-login-localmente).
Use apenas documentos **fictícios ou anonimizados**.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | App + Worker rodando localmente |
| `npm test` | Testes automáticos (Vitest) |
| `npm run typecheck` | Checagem de tipos |
| `npm run build` | Build de produção |
| `npm run deploy` | Typecheck + testes + build + publicação na Cloudflare |
| `npm run usuarios -- ajuda` | Gerenciamento de acessos |
| `npm run cf-typegen` | Regenera os tipos do Worker após mudar o `wrangler.jsonc` |

## Publicação

Passo a passo em [docs/DEPLOY-TESTE.md](docs/DEPLOY-TESTE.md) e checklist em
[SECURITY.md](SECURITY.md#checklist-de-implantação). Secrets usados na Cloudflare:
`SESSION_SECRET`, `USUARIOS` e (para a análise) `OPENAI_API_KEY`. Nenhum segredo vai para o Git.

## Identidade visual

Somente três cores: `#EFEBE0` (fundo), `#F3EEE6` (cartões e campos) e `#8A1C17` (texto, botões e bordas).
Estados e erros são diferenciados por peso, bordas e sublinhado, não por cores extras.
O logo é uma imagem e mantém suas cores originais.

## Documentação

[ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md) · [CLAUDE.md](CLAUDE.md)
