# Arquitetura

```
Navegador (React)
  ├─ Tela de login: nome + senha (sem sessão)
  ├─ PDF.js (worker servido pelo app) → texto por página
  ├─ src/pdf/juntar.ts: junta extratos num PDF só (pdf-lib) e baixa o arquivo
  ├─ src/nido/ler.ts: lê Recibos do Locatário e Extratos de Repasse do NIDO
  ├─ src/nido/conferir.ts: regras de conferência e totais por conta (docs/REGRAS-CONFERENCIA.md), sem IA
  ├─ src/components/Resultado.tsx: resultado e relatório (por conta, dados bancários, lançamentos manuais)
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
   Do cabeçalho do extrato saem também os dados bancários do proprietário (CPF/CNPJ, forma, banco, agência, conta,
   tipo e descrição). Em PDF de extratos, `extratosNaoLidos` conta os extratos pelo texto ("Total Pendente
   Contrato N") e o arquivo é recusado se não bater com o que foi lido.
4. `conferir` casa recibo × extrato por contrato + vencimento e aplica as regras (valores em centavos).
5. Os registros lidos ficam **só em memória** enquanto a conferência está na tela, para permitir adicionar ou trocar
   extratos e excluir um extrato sem recomeçar (`conferirSem` refaz a conferência sem os excluídos). Extratos de
   lotes anteriores já pagos (opcional) são comparados por número e proprietário (`jaPagosAntes`) e ficam fora da
   soma até a pessoa liberar.
6. O relatório calcula os totais por conta de saída (`totais`), somando os lançamentos manuais digitados, e pode
   ser filtrado por conta (Todos / Só Bradesco / Só Itaú). A conta de cada repasse pode ser trocada à mão
   (`contaDoRepasse`). A impressão é feita pelo navegador (`window.print`).
7. "Nova conferência", "Sair", recarregar ou fechar a página apagam registros, resultado, escolhas de conta e
   lançamentos manuais.

**Juntar PDF** (`src/pdf/juntar.ts`): copia as páginas originais dos extratos para um PDF novo, grava no próprio
arquivo de qual PDF veio cada página e só **baixa** o resultado; o app lê esse PDF como qualquer outro.

A rota `/api/analisar` (OpenAI) continua no Worker, mas o app não a usa mais.

## Limites (provisórios, `shared/contrato.ts`)

20 MB por arquivo · 1.000 páginas por documento. Só da rota `/api/analisar` (sem uso): 400.000 caracteres no
total · corpo até 4 MB.

## Ambientes

- **Desenvolvimento:** `npm run dev` + `.dev.vars` (login simulado só em localhost).
- **Teste/produção:** `*.workers.dev` (sem domínio próprio: uso temporário), variáveis em `wrangler.jsonc`, segredos como Secret.

OCR não é necessário: PDF sem texto é recusado e a pessoa exporta o relatório direto do NIDO.
