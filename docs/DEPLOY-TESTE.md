# Deploy de teste e gestão de usuários

App publicado em `https://financeirospl.specialimoveis.workers.dev`
(Worker `financeirospl`, subdomínio da conta `specialimoveis`).
Login: **nome + senha gerada** pelo administrador. Sem cartão, sem Zero Trust, sem serviços externos de login.
Usar apenas documentos **fictícios ou anonimizados**.

Todos os comandos rodam no terminal do VS Code, na pasta do projeto (já logado com `npx wrangler login`).

## 1. Chave de sessão (uma vez só)

```bash
npx wrangler secret put SESSION_SECRET
```

Cole um texto aleatório com pelo menos 32 caracteres. Posso gerar e gravar direto, sem que ele apareça.
Trocar essa chave depois **desconecta todo mundo**.

## 2. Cadastrar as pessoas

No painel do Supabase: **Authentication → Users → Add user → Create new user**, com e-mail, senha e
**Auto Confirm User** marcado. Entregue a senha por um canal privado. Antes, desligue o cadastro aberto em
**Authentication → Sign In / Providers → Allow new users to sign up**.

## 3. Publicar o app

```bash
npm run deploy
```

## 4. Verificar (janela anônima)

- [ ] `/` → tela de login com E-mail e Senha
- [ ] `/api/eu` → `{"erro":"nao_autenticado"}`
- [ ] E-mail e senha corretos → área interna, e-mail no topo
- [ ] Senha errada → “E-mail ou senha incorretos.”
- [ ] **Sair** → volta para a tela de login
- [ ] Selecionar dois PDFs fictícios → páginas e situação exibidas

## Gerenciar acessos

Pelo painel do Supabase (projeto dos represados), em **Authentication → Users**. Vale na hora, sem publicar o app.

| Situação | Onde |
|---|---|
| Nova pessoa | **Add user → Create new user**: e-mail + senha, com **Auto Confirm User** marcado. Entregue a senha em particular |
| Esqueceu a senha ou a senha vazou | Abra a usuária → troque a senha |
| Tirar o acesso | Apague a usuária (ou bloqueie): perde o acesso na próxima ação |
| Desconectar todo mundo | Trocar o `SESSION_SECRET` (`npx wrangler secret put SESSION_SECRET`) |

- O cadastro aberto precisa ficar **desligado** (Authentication → Sign In / Providers → *Allow new users to sign up*):
  com ele ligado, qualquer pessoa com o endereço do Supabase poderia criar uma conta e entrar.
- A sessão dura 8 horas. Se o Supabase estiver fora do ar, ninguém entra.

## Testar o login localmente

1. No `.dev.vars`, deixe `DEV_EMAIL=` vazio e preencha `SESSION_SECRET`.
2. Preencha `SUPABASE_URL` e `SUPABASE_KEY` de um projeto Supabase de teste e crie uma usuária nele
3. `npm run dev`
