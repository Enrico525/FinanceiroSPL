import type { Ambiente } from "./ambiente";
import { supabaseAuth } from "./login";
import { lerSessao } from "./sessao";

type AmbienteAuth = Pick<Ambiente, "AMBIENTE" | "DEV_EMAIL" | "SESSION_SECRET" | "SUPABASE_URL" | "SUPABASE_KEY">;

/**
 * Retorna o e-mail da usuária autenticada, ou null.
 * Em toda requisição: confere a assinatura/validade do cookie de sessão E se a usuária continua no
 * Supabase Auth, sem bloqueio (apagar ou banir no painel revoga o acesso na hora). Supabase fora do ar = sem acesso.
 */
export async function autenticar(request: Request, env: AmbienteAuth): Promise<string | null> {
  const host = new URL(request.url).hostname;
  // Desenvolvimento local sem login real. Exige as duas condições para nunca valer em produção.
  if (env.AMBIENTE === "desenvolvimento" && env.DEV_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    return env.DEV_EMAIL;
  }

  const id = await lerSessao(request, env);
  if (!id || !env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  try {
    const r = await supabaseAuth(env, `admin/users/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const u = (await r.json()) as { id?: unknown; email?: unknown; banned_until?: unknown; deleted_at?: unknown };
    if (u.id !== id || typeof u.email !== "string" || u.deleted_at) return null;
    if (typeof u.banned_until === "string" && Date.parse(u.banned_until) > Date.now()) return null;
    return u.email;
  } catch {
    return null;
  }
}
