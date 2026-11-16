# Conferência Financeira — Special Imóveis

Ferramenta interna para conferir os **Recibos do Locatário** contra os **Extratos de Repasse** exportados do NIDO
e somar o que deve ser repassado por conta (Itaú e Bradesco).
Os PDFs são lidos e conferidos **no navegador**, com regras fixas e sem IA: nada é enviado nem armazenado.

**Endereço:** <https://financeirospl.specialimoveis.workers.dev> (acesso só com nome e senha cadastrados)

> **Status:** em uso com lotes reais. Regras em [docs/REGRAS-CONFERENCIA.md](docs/REGRAS-CONFERENCIA.md);
> perguntas em aberto com o financeiro em [CLAUDE.md](CLAUDE.md#pendências-aguardando-o-negócio).

## Funcionalidades

**Páginas (menu lateral)**

| Página | Para que serve |
|---|---|
| **Juntar PDF** | Junta vários Extratos de Repasse num PDF só e baixa o arquivo para o computador |
| **Repasses únicos** | Os recibos ficam carregados e você confere um ou vários extratos por vez |
| **Repasses juntados** | Todos os recibos × todos os extratos de uma vez (ou o PDF juntado) |

**Conferência**

- Casa recibo e extrato por **contrato + vencimento** e aplica as regras do financeiro, centavo por centavo.
- Separa o resultado em: com divergência, conferir manualmente, recibo sem extrato, extrato sem recibo e sem divergência.
- Mostra em qual arquivo e página está cada contrato (no PDF juntado, também o arquivo original).
- “Conferi manualmente: marcar como certo” tira o contrato da lista de pendências; dá para desfazer.
- Depois de conferir, dá para **adicionar ou trocar extratos** (a versão corrigida substitui a anterior) e
  **remover um extrato** da análise, sem recomeçar.

**Relatório**

- Lista tudo o que foi conferido, com o que bateu e o que foi apontado.
- **Total a repassar** no geral e por conta de saída: repasse para Bradesco sai do Bradesco; para qualquer outro
  banco, sai do Itaú.
- **Relatório por conta:** “Todos”, “Só Bradesco” ou “Só Itaú”. Com uma conta escolhida, totais, contratos e
  impressão mostram só aquela conta.
- **Dados bancários** de cada proprietário, como estão no extrato: CPF/CNPJ, forma de pagamento, banco, agência,
  conta, tipo de conta e observação do cadastro (costuma indicar o titular da conta).
- **Extrato sem banco:** fica destacado até você escolher em qual conta somar.
- **Lançamentos manuais:** valores de repasses feitos por fora do NIDO (sem extrato) podem ser digitados e somam
  no total da conta escolhida. Só somam; não são conferidos.
- **Remover extrato:** botão em cada contrato, no quadro “sem banco” e numa lista com pesquisa por número do
  contrato e por valor. O contrato removido sai do resultado e do relatório; “Colocar de volta” desfaz.
- “Imprimir / salvar em PDF” gera a cópia para guardar.

## Como funciona

1. **Login.** Nome + senha gerada pelo administrador. O Worker da Cloudflare confere a senha e cria uma sessão de
   8 horas num cookie assinado. Não há cadastro pelo site nem “esqueci a senha”.
2. **Leitura dos PDFs.** O navegador abre os PDFs com o PDF.js e extrai o texto de cada página. O arquivo e o
   texto **não saem do computador**.
3. **Interpretação.** Como os relatórios do NIDO têm layout fixo, o app transforma o texto em registros (contrato,
   vencimento, lançamentos, valores, banco) com regras fixas (`src/nido/ler.ts`).
4. **Conferência.** As regras de [docs/REGRAS-CONFERENCIA.md](docs/REGRAS-CONFERENCIA.md) são aplicadas em
   centavos inteiros (`src/nido/conferir.ts`). Não há IA em nenhuma etapa.
5. **Resultado e relatório.** Ficam só na memória da página. “Nova conferência”, “Sair”, recarregar ou fechar a
   página apagam tudo: não há histórico, banco de dados nem arquivo salvo pelo app.

O servidor (Worker) só cuida do login e de entregar o site. Detalhes em [ARCHITECTURE.md](ARCHITECTURE.md).

## Como usar

1. Entre com **nome + senha**.
2. Exporte do NIDO o **Recibo do Locatário** e os **Extratos de Repasse**, em PDF.
   PDF feito por “Imprimir → Microsoft Print to PDF” não tem texto e é recusado.
3. Se os extratos vieram em vários arquivos, use **Juntar PDF** para ter um só (opcional: o app também aceita
   vários arquivos de cada lado).
4. Em **Repasses juntados** (ou **Repasses únicos**), adicione os PDFs e clique em **Conferir**.
5. Trate as pendências:
   - **Com divergência** e **Conferir manualmente:** confira no NIDO e marque “Conferi manualmente” quando estiver certo.
   - **Recibo sem extrato** e **Extrato sem recibo:** normalmente é arquivo que não foi enviado.
6. Abra **Ver relatório do que foi conferido**. Escolha a conta dos extratos sem banco, digite os lançamentos
   manuais, remova o que não entra no lote e escolha “Só Bradesco” ou “Só Itaú” para imprimir um relatório por conta.
7. “Imprimir / salvar em PDF” guarda a cópia. Ao sair, tudo é apagado.

## Gerenciar acessos

Feito pelo terminal, na pasta do projeto, por quem administra a ferramenta (precisa estar logado na Cloudflare:
`npx wrangler login`).

| Situação | Comando |
|---|---|
| Nova pessoa | `npm run usuarios -- adicionar "Nome Sobrenome"` |
| Esqueceu a senha ou a senha vazou | `npm run usuarios -- nova-senha "Nome Sobrenome"` |
| Tirar o acesso | `npm run usuarios -- remover "Nome Sobrenome"` |
| Ver quem tem acesso | `npm run usuarios -- listar` |
| **Aplicar as mudanças no site** | `npm run usuarios -- publicar` (vale na hora, sem publicar o app) |
| Aplicar só no computador (teste) | `npm run usuarios -- publicar --local` (grava no `.dev.vars`) |
| Ver a ajuda | `npm run usuarios -- ajuda` |

- Depois de `adicionar`, `nova-senha` ou `remover`, rode sempre o `publicar`: sem ele nada muda no site.
- A senha aparece **uma única vez** no terminal: entregue em particular e peça que a pessoa salve no navegador.
- `usuarios.local.json` guarda só nomes e hashes (nunca senhas) e fica fora do Git. Faça uma cópia de segurança;
  se ele for perdido, é preciso gerar senha nova para todos.
- Para desconectar todo mundo de uma vez, troque o `SESSION_SECRET` (`npx wrangler secret put SESSION_SECRET`).
- Cabem cerca de 50 usuários. A sessão dura 8 horas.

## Comandos do projeto

Requisitos: Node.js 22+ (testado com 24) e conta Cloudflare (Workers, plano gratuito serve).

| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências (primeira vez ou depois de atualizar o projeto) |
| `npm run dev` | App + Worker rodando no computador |
| `npm test` | Testes automáticos (Vitest) |
| `npm run typecheck` | Checagem de tipos |
| `npm run build` | Checagem de tipos + build de produção em `dist/` |
| `npm run preview` | Build + servidor local com a versão de produção |
| `npm run deploy` | Typecheck + testes + build + **publicação no site** |
| `npm run usuarios -- <comando>` | Gerencia os acessos (tabela acima) |
| `npm run cf-typegen` | Regenera os tipos do Worker após mudar o `wrangler.jsonc` |

### Rodar no computador

```bash
npm install
```

```bash
cp .env.example .dev.vars
```

```bash
npm run dev
```

Em `localhost`, com `AMBIENTE=desenvolvimento` e `DEV_EMAIL` preenchido, o login é pulado.
Para testar o login real, veja [docs/DEPLOY-TESTE.md](docs/DEPLOY-TESTE.md#testar-o-login-localmente).
Use só documentos **fictícios ou anonimizados**: nunca versione PDFs reais (têm CPF, nomes e contas).

### Publicar

```bash
npm run deploy
```

O comando só publica se a checagem de tipos e os testes passarem. Passo a passo da primeira publicação em
[docs/DEPLOY-TESTE.md](docs/DEPLOY-TESTE.md) e checklist em [SECURITY.md](SECURITY.md#checklist-de-implantação).
Secrets na Cloudflare: `SESSION_SECRET` e `USUARIOS`.
A rota de IA (`OPENAI_API_KEY`) continua no Worker, mas o app não a usa hoje. Nenhum segredo vai para o Git.

## Estrutura do código

| Pasta | Conteúdo |
|---|---|
| `src/` | Site (React): `App.tsx` (páginas), `components/` (login, seletor de PDF, resultado e relatório) |
| `src/pdf/` | `extrair.ts` (leitura do PDF no navegador) e `juntar.ts` (Juntar PDF) |
| `src/nido/` | `ler.ts` (texto do NIDO → registros) e `conferir.ts` (regras e totais), com os testes ao lado |
| `worker/` | Servidor na Cloudflare: login, sessão e rotas |
| `shared/` | Limites, contrato e geração de senha, usados pelo site e pelo Worker |
| `scripts/` | `usuarios.ts` (gestão de acessos) |
| `docs/` | Regras da conferência e guia de publicação |

Limites por arquivo: 20 MB e 200 páginas.

## Identidade visual

Só três cores: `#EFEBE0` (fundo), `#F3EEE6` (cartões e campos) e `#8A1C17` (texto, botões e bordas).
Estados e erros se distinguem por peso, bordas e sublinhado, não por cores extras. O logo mantém as cores originais.

## Documentação

[Regras da conferência](docs/REGRAS-CONFERENCIA.md) · [Publicação e acessos](docs/DEPLOY-TESTE.md) ·
[ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md) · [CLAUDE.md](CLAUDE.md)
