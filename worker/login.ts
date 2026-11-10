import { hashSenha, iguais, lerUsuarios, normalizarNome } from "../shared/credenciais";
import type { Ambiente } from "./ambiente";
import { cookieSessao, criarSessao } from "./sessao";
import { erro, json } from "./resposta";

const HASH_FALSO = "0".repeat(64);

/** POST /auth/entrar { nome, senha } → cria a sessão. Mensagem igual para nome ou senha errados. */
export async function entrar(request: Request, env: Ambiente): Promise<Response> {
  let corpo: { nome?: unknown; senha?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao_invalida");
  }
  const nome = normalizarNome(String(corpo?.nome ?? "")).slice(0, 100);
  const senha = String(corpo?.senha ?? "").slice(0, 100);
  if (!nome || !senha) return erro("credenciais_invalidas");

  // Limite também por nome: impede tentar muitas senhas contra a mesma pessoa a partir de vários IPs.
  if (!(await env.LIMITADOR.limit({ key: `login:${nome}` })).success) return erro("limite_requisicoes");

  const usuarios = lerUsuarios(env.USUARIOS);
  const existe = Object.hasOwn(usuarios, nome);
  const confere = iguais(await hashSenha(senha), existe ? usuarios[nome] : HASH_FALSO);
  if (!existe || !confere) return erro("credenciais_invalidas");

  const token = await criarSessao(nome, env);
  return json({ usuario: nome }, 200, { "Set-Cookie": cookieSessao(token) });
}
