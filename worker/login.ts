import type { Ambiente } from "./ambiente";
import { cookieSessao, criarSessao } from "./sessao";
import { erro, json } from "./resposta";

type AmbienteSupabase = Pick<Ambiente, "SUPABASE_URL" | "SUPABASE_KEY">;

/** Chamada ao Supabase Auth com a chave secreta (só no header apikey: a chave nova não é JWT). */
export const supabaseAuth = (env: AmbienteSupabase, caminho: string, init: RequestInit = {}) =>
  fetch(`${env.SUPABASE_URL}/auth/v1/${caminho}`, {
    ...init,
    headers: { apikey: env.SUPABASE_KEY, "Content-Type": "application/json", ...init.headers },
  });

/** POST /auth/entrar { email, senha } → confere no Supabase Auth e cria a sessão. Mensagem igual para e-mail ou senha errados. */
export async function entrar(request: Request, env: Ambiente): Promise<Response> {
  let corpo: { email?: unknown; senha?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao_invalida");
  }
  const email = String(corpo?.email ?? "").trim().toLowerCase().slice(0, 200);
  const senha = String(corpo?.senha ?? "").slice(0, 200);
  if (!email || !senha) return erro("credenciais_invalidas");

  // Limite também por e-mail: impede tentar muitas senhas contra a mesma pessoa a partir de vários IPs.
  if (!(await env.LIMITADOR.limit({ key: `login:${email}` })).success) return erro("limite_requisicoes");
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return erro("falha_banco");

  const r = await supabaseAuth(env, "token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password: senha }) });
  // 400 = e-mail/senha errados (ou e-mail não confirmado); o resto é falha do Supabase.
  if (r.status === 400) return erro("credenciais_invalidas");
  if (r.status === 429) return erro("limite_requisicoes");
  if (!r.ok) return erro("falha_banco");
  const { user } = (await r.json()) as { user?: { id?: unknown; email?: unknown } };
  if (typeof user?.id !== "string") return erro("falha_banco");

  // A sessão do Supabase é descartada: o app usa o próprio cookie, com o id da usuária.
  const token = await criarSessao(user.id, env);
  return json({ usuario: typeof user.email === "string" ? user.email : email }, 200, { "Set-Cookie": cookieSessao(token) });
}
