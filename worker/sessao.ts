// Sessão em cookie HttpOnly com token assinado (HS256). Sem banco de dados:
// a validade vem da assinatura + expiração, e a autorização do Secret USUARIOS.
import { jwtVerify, SignJWT } from "jose";
import type { Ambiente } from "./ambiente";

export const COOKIE_SESSAO = "__Host-sessao";
export const DURACAO_SESSAO_S = 8 * 60 * 60; // um expediente

type AmbienteSessao = Pick<Ambiente, "SESSION_SECRET">;

function chave(env: AmbienteSessao): Uint8Array {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET ausente ou curto");
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export function criarSessao(usuario: string, env: AmbienteSessao, segundos = DURACAO_SESSAO_S): Promise<string> {
  return new SignJWT({ usuario })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("sessao")
    .setIssuedAt()
    .setExpirationTime(`${segundos}s`)
    .sign(chave(env));
}

/** Usuário da sessão se assinatura e validade conferem; senão null. */
export async function lerSessao(request: Request, env: AmbienteSessao): Promise<string | null> {
  const token = lerCookie(request, COOKIE_SESSAO);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave(env), { audience: "sessao", algorithms: ["HS256"] });
    return typeof payload.usuario === "string" ? payload.usuario : null;
  } catch {
    return null;
  }
}

function lerCookie(request: Request, nome: string): string | null {
  for (const parte of (request.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return v.join("=");
  }
  return null;
}

/** __Host- exige Secure, Path=/ e nenhum Domain: o cookie fica preso a este endereço. */
export const cookieSessao = (valor: string, maxAge = DURACAO_SESSAO_S) =>
  `${COOKIE_SESSAO}=${valor}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

export const apagarSessao = () => cookieSessao("", 0);
