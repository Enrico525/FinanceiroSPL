// Conferência determinística: a IA não é autoridade. Todo trecho citado precisa
// existir de fato na página indicada; caso contrário, o item é sinalizado.
import type { Referencia } from "../shared/contrato";
import type { PaginaExtraida } from "./pdf/extrair";

export type TextosPorDocumento = Record<"A" | "B", PaginaExtraida[]>;

const normalizar = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export const chave = (ref: Referencia) => `${ref.documento}|${ref.pagina}|${ref.trecho_literal}`;

/** Confere todas as referências do resultado; devolve as chaves das que foram encontradas. */
export function conferirReferencias(refs: Referencia[], textos: TextosPorDocumento): Set<string> {
  return new Set(refs.filter((r) => trechoConfere(r, textos)).map(chave));
}

export function trechoConfere(ref: Referencia, textos: TextosPorDocumento): boolean {
  const pagina = textos[ref.documento].find((p) => p.numero === ref.pagina);
  const trecho = normalizar(ref.trecho_literal);
  return !!pagina && trecho.length > 0 && normalizar(pagina.texto).includes(trecho);
}
