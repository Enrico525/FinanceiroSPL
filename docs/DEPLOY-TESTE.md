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

Para cada pessoa:

```bash
npm run usuarios -- adicionar "Maria Silva"
```

A senha aparece **uma única vez** no terminal (ex.: `K7QM-2XPA-9TRF-4WHN`). Entregue à pessoa por um
canal privado (pessoalmente ou mensagem direta, nunca em grupo) e peça que ela salve no navegador ou num
gerenciador de senhas. **Eu não devo ver as senhas:** rode esse comando você mesmo.

Depois de cadastrar todo mundo, envie a lista para a Cloudflare (vale na hora, sem deploy):

```bash
npm run usuarios -- publicar
```

## 3. Publicar o app

```bash
npm run deploy
```

## 4. Verificar (janela anônima)

- [ ] `/` → tela de login com Nome e Senha
- [ ] `/api/eu` → `{"erro":"nao_autenticado"}`
- [ ] Nome e senha corretos → área interna, nome no topo
- [ ] Senha errada → “Nome ou senha incorretos.”
- [ ] **Sair** → volta para a tela de login
- [ ] Selecionar dois PDFs fictícios → páginas e situação exibidas

## Gerenciar acessos

| Situação | Comando (depois: `npm run usuarios -- publicar`) |
|---|---|
| Nova pessoa | `npm run usuarios -- adicionar "Nome"` |
| Esqueceu a senha / senha vazou | `npm run usuarios -- nova-senha "Nome"` |
| Tirar o acesso | `npm run usuarios -- remover "Nome"` (efeito imediato após publicar) |
| Ver quem tem acesso | `npm run usuarios -- listar` |
| Desconectar todo mundo | trocar o `SESSION_SECRET` |

O arquivo `usuarios.local.json` guarda **só nomes e hashes** (nunca senhas) e fica fora do Git.
Se ele for perdido, basta gerar senhas novas para todos.

## Testar o login localmente

1. No `.dev.vars`, deixe `DEV_EMAIL=` vazio e preencha `SESSION_SECRET`.
2. `npm run usuarios -- adicionar "Teste"` e `npm run usuarios -- publicar --local`
3. `npm run dev`
