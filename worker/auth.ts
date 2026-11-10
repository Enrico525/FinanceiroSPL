import { lerUsuarios } from "../shared/credenciais";
import type { Ambiente } from "./ambiente";
import { lerSessao } from "./sessao";

type AmbienteAuth = Pick<Ambiente, "AMBIENTE" | "DEV_EMAIL" | "SESSION_SECRET" | "USUARIOS">;

/**
 * Retorna o usuário autenticado, ou null.
 * Em toda requisição: confere a assinatura/validade do cookie de sessão E se o usuário
 * continua cadastrado em USUARIOS (removê-lo revoga o acesso imediatamente).
 */
export async function autenticar(request: Request, env: AmbienteAuth): Promise<string | null> {
  const host = new URL(request.url).hostname;
  // Desenvolvimento local sem login real. Exige as duas condições para nunca valer em produção.
  if (env.AMBIENTE === "desenvolvimento" && env.DEV_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    return env.DEV_EMAIL;
  }

  const usuario = await lerSessao(request, env);
  return usuario && Object.hasOwn(lerUsuarios(env.USUARIOS), usuario) ? usuario : null;
}
