// Repasses represados no Supabase (tabela em supabase/represados.sql), via REST (PostgREST), sem biblioteca.
import type { PedidoApagar, PedidoGuardar, Represado } from "../shared/contrato";
import type { Ambiente } from "./ambiente";

export class ErroBanco extends Error {}

async function supabase(env: Ambiente, caminho: string, init: RequestInit = {}): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new ErroBanco();
  const resposta = await fetch(`${env.SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    // Só "apikey": as chaves novas (sb_secret_…) não são JWT e não vão no Authorization.
    headers: { apikey: env.SUPABASE_KEY, "Content-Type": "application/json", ...init.headers },
  });
  if (!resposta.ok) throw new ErroBanco();
  return resposta;
}

/**
 * Os represados guardados, os nomes dos proprietários que pedem para segurar o repasse e, em `grupos`,
 * nome → grupo de quem é partilhado (mesmo grupo = uma caixa só na página Represados).
 */
export async function listarRepresados(
  env: Ambiente,
): Promise<{ itens: Represado[]; nomes: string[]; grupos: Record<string, string> }> {
  const [itens, nomes] = await Promise.all([
    supabase(env, "represados?select=id,tipo,dados&order=id").then((r) => r.json() as Promise<Represado[]>),
    supabase(env, "represados_nomes?select=nome,grupo").then((r) => r.json() as Promise<{ nome: string; grupo: string | null }[]>),
  ]);
  const grupos = Object.fromEntries(nomes.flatMap((n) => (n.grupo ? [[n.nome, n.grupo]] : [])));
  return { itens, nomes: nomes.map((n) => n.nome), grupos };
}

export async function guardarRepresados(env: Ambiente, pedido: PedidoGuardar, usuario: string): Promise<void> {
  const linhas = [
    ...pedido.recibos.map((dados) => ({ tipo: "recibo", dados, guardado_por: usuario })),
    ...pedido.repasses.map((dados) => ({ tipo: "repasse", dados, guardado_por: usuario })),
  ];
  await supabase(env, "represados", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(linhas) });
}

export async function apagarRepresados(env: Ambiente, { ids }: PedidoApagar): Promise<void> {
  await supabase(env, `represados?id=in.(${ids.join(",")})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

/** Cron: uma leitura mínima conta como atividade e impede o Supabase grátis de pausar o projeto (7 dias sem uso). */
export async function manterAtivo(env: Ambiente): Promise<void> {
  await supabase(env, "represados?select=id&limit=1");
}
