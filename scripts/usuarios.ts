// Gerencia quem pode entrar na plataforma. Comandos: npm run usuarios -- ajuda
// usuarios.local.json guarda só nomes e hashes (nunca senhas) e fica fora do Git.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { gerarSenha, hashSenha, lerUsuarios, normalizarNome, type MapaUsuarios } from "../shared/credenciais.ts";

const AJUDA = `
Gerencia quem pode entrar na plataforma.

Uso: npm run usuarios -- <comando> ["Nome"]

  adicionar "Nome"    cadastra a pessoa e mostra a senha (UMA vez só)
  nova-senha "Nome"   gera uma senha nova (esqueceu ou vazou)
  remover "Nome"      tira o acesso da pessoa
  listar              mostra quem está cadastrado
  publicar            envia a lista para a Cloudflare (vale na hora)
  publicar --local    grava a lista no .dev.vars (teste no computador)
  ajuda               mostra esta mensagem

Depois de adicionar, nova-senha ou remover, rode sempre: npm run usuarios -- publicar
`;

const ARQUIVO = "usuarios.local.json";
const carregar = (): MapaUsuarios => (existsSync(ARQUIVO) ? lerUsuarios(readFileSync(ARQUIVO, "utf8")) : {});
const salvar = (u: MapaUsuarios) => writeFileSync(ARQUIVO, JSON.stringify(u, null, 2) + "\n");
const sair = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

const [comando, ...resto] = process.argv.slice(2);
const nome = normalizarNome(resto.filter((a) => !a.startsWith("--")).join(" "));
const usuarios = carregar();

async function definirSenha() {
  const senha = gerarSenha();
  usuarios[nome] = await hashSenha(senha);
  salvar(usuarios);
  console.log(`\nUsuário: ${nome}\nSenha:   ${senha}\n`);
  console.log("Entregue a senha à pessoa por um canal privado. Ela NÃO será mostrada de novo.");
  console.log("Depois rode: npm run usuarios -- publicar\n");
}

switch (comando) {
  case "adicionar":
    if (!nome) sair('Informe o nome: npm run usuarios -- adicionar "Maria Silva"');
    if (Object.hasOwn(usuarios, nome)) sair(`"${nome}" já existe. Use nova-senha para trocar a senha.`);
    await definirSenha();
    break;
  case "nova-senha":
    if (!Object.hasOwn(usuarios, nome)) sair(`"${nome}" não está cadastrado.`);
    await definirSenha();
    break;
  case "remover":
    if (!Object.hasOwn(usuarios, nome)) sair(`"${nome}" não está cadastrado.`);
    delete usuarios[nome];
    salvar(usuarios);
    console.log(`"${nome}" removido. Rode: npm run usuarios -- publicar`);
    break;
  case "listar":
    console.log(Object.keys(usuarios).join("\n") || "(nenhum usuário)");
    break;
  case "publicar": {
    const json = JSON.stringify(usuarios);
    if (process.argv.includes("--local")) {
      const atual = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf8") : "";
      const linha = `USUARIOS='${json}'`;
      const novo = /^USUARIOS=.*$/m.test(atual) ? atual.replace(/^USUARIOS=.*$/m, linha) : `${atual.trimEnd()}\n${linha}\n`;
      writeFileSync(".dev.vars", novo);
      console.log("Lista gravada no .dev.vars. Reinicie o npm run dev.");
      break;
    }
    const r = spawnSync("npx", ["wrangler", "secret", "put", "USUARIOS"], {
      input: json,
      stdio: ["pipe", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    if (r.status !== 0) sair("Falha ao publicar. Confira se está logado: npx wrangler whoami");
    console.log(`Lista publicada (${Object.keys(usuarios).length} usuário(s)).`);
    break;
  }
  case undefined:
  case "ajuda":
  case "--help":
  case "-h":
    console.log(AJUDA);
    break;
  default:
    sair(`Comando desconhecido: "${comando}".\n${AJUDA}`);
}
