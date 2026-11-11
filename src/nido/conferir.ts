// Regras de conferência Recibo do Locatário × Extrato de Repasse, definidas com o financeiro.
// Tudo em centavos inteiros. Nenhuma regra aqui depende de IA.
import type { LinhaRepasse, Recibo, Repasse } from "./ler";

export type Apontamento = { tipo: "divergencia" | "manual" | "aviso"; texto: string };
export type Caso = {
  contrato: string;
  vencimento: string;
  competencia: string;
  situacao: string;
  inquilino: string;
  proprietarios: string[];
  /** Onde achar no PDF: "arquivo.pdf, pág. 3". */
  onde: string[];
  /** sem_extrato / sem_recibo: o outro lado não está nos arquivos enviados. */
  status: "ok" | "divergencia" | "manual" | "sem_extrato" | "sem_recibo";
  apontamentos: Apontamento[];
};

export const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const simples = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const ehPagamentoAdm = (h: string) => /^taxa adm\.?\/aluguel/i.test(h);
const ehIntermediacao = (h: string) => /^taxa (de )?intermedia/i.test(h);
const ehAluguel = (h: string) => /^aluguel/i.test(h);
const ehAbono = (h: string) => /^abono/i.test(h);
const ehMulta = (h: string) => /^(multa|juros)/i.test(h);
const ehIrrf = (h: string) => /^irrf/i.test(h);
const ehSeguro = (h: string) => /^seguro/i.test(h);
const ehDiferenca = (h: string) => /diferen[cç]a/i.test(h);
// Pagos pelo inquilino e retidos pela imobiliária: nunca vão ao proprietário.
const ehRetidoNoRecibo = (h: string) =>
  ehSeguro(h) ||
  /^(taxa de expediente|servi[cç]o de despachante|despachante|taxa (de )?assinatura digital|taxa (de )?boleto|boleto de cau?[cç]ionamento|matr[ií]cula atualizada)/i.test(
    h,
  );
// Descontos ao proprietário previstos no extrato, sem origem no recibo.
const ehDebitoPrevisto = (h: string) => /^(taxa de repasse|taxa de renova[cç][aã]o|vistoria)/i.test(h);

/** "33,33" → 3333 (centésimos de ponto percentual). */
const participacao = (p: string) => {
  const [i, d = ""] = p.split(",");
  return Number(i) * 100 + Number(d.padEnd(2, "0").slice(0, 2));
};

/** (aluguel − abono + multa) × taxa, arredondado meio-para-cima. Conferido em 106 de 106 extratos reais. */
export function taxaAdmEsperada(linhas: LinhaRepasse[], taxa: number): number {
  const soma = (f: (h: string) => boolean) => linhas.filter((l) => f(l.historico)).reduce((n, l) => n + l.bruto, 0);
  const base = soma(ehAluguel) - soma(ehAbono) + soma(ehMulta);
  return Math.floor((base * taxa + 500_000) / 1_000_000);
}

type Modo = "normal" | "special" | "pre-cadastro";

function regraSituacao(situacao: string): { modo: Modo | null; manual: string | null } {
  const s = simples(situacao);
  if (s.includes("juridico")) return { modo: null, manual: "Situação Jurídico: analisar manualmente." };
  if (s === "normal" || s.includes("iptupginquilino") || s.includes("garantido")) return { modo: "normal", manual: null };
  if (s.includes("condpginquilino"))
    return { modo: "normal", manual: "Situação Cond. PG Inquilino: conferir manualmente (valores checados abaixo)." };
  if (s.includes("contaspgspecial"))
    return { modo: "special", manual: "Situação Contas PG Special: conferir manualmente (valores checados abaixo)." };
  if (s.includes("precadastro")) return { modo: "pre-cadastro", manual: null };
  return { modo: null, manual: `Situação "${situacao}" não prevista: analisar manualmente.` };
}

// Em Contas PG Special só aluguel, multa/juros, abono e IRRF vão ao proprietário; o resto fica retido.
const repassaEmSpecial = (h: string) => ehAluguel(h) || ehMulta(h) || ehAbono(h) || ehIrrf(h);

/** Confere um recibo contra os extratos (um por proprietário) do mesmo contrato e vencimento. */
function conferirPar(recibo: Recibo | null, repasses: Repasse[], ap: Apontamento[]) {
  const div = (texto: string) => ap.push({ tipo: "divergencia", texto });
  const r0 = repasses[0];
  const { modo, manual } = regraSituacao(r0.situacao);
  if (manual) ap.push({ tipo: "manual", texto: manual });
  if (!modo) return;

  // Junta os lançamentos de todos os proprietários (um item pode ir 100% para um só deles) e confere
  // se as partes somam o bruto. O NIDO arredonda cada parte: tolera 1 centavo por proprietário.
  const porLinha = new Map<string, LinhaRepasse[]>();
  for (const r of repasses)
    for (const l of r.linhas) {
      const k = `${l.historico}|${l.bruto}|${l.debito > 0}`;
      porLinha.set(k, [...(porLinha.get(k) ?? []), l]);
    }
  const linhas = [...porLinha.values()].map((partes) => partes[0]);
  for (const l of linhas)
    if (ehDiferenca(l.historico))
      ap.push({ tipo: "manual", texto: `"${l.historico}" (${reais(l.bruto)}) no extrato: conferir manualmente.` });
  let parcial = false;
  for (const partes of porLinha.values()) {
    const bruto = partes[0].bruto;
    const cobertura = partes.reduce((n, x) => n + participacao(x.participacao), 0);
    if (cobertura >= 9990) {
      // Todos os proprietários nos arquivos: as partes devem somar o total.
      const soma = partes.reduce((n, x) => n + x.credito + x.debito, 0);
      if (Math.abs(soma - bruto) > (partes.length > 1 ? partes.length : 0))
        div(`"${partes[0].historico}": as partes dos proprietários somam ${reais(soma)}, mas o total é ${reais(bruto)}.`);
      continue;
    }
    // Só parte dos proprietários (ex.: um extrato por vez): confere cada parte pelo percentual impresso.
    // O NIDO calcula com mais casas (33,333…%) do que imprime (33,33%): tolera 0,005% do bruto + 1 centavo.
    parcial = true;
    const tolerancia = Math.ceil(bruto / 20_000) + 1;
    for (const x of partes) {
      const esperado = Math.round((bruto * participacao(x.participacao)) / 10_000);
      if (Math.abs(x.credito + x.debito - esperado) > tolerancia)
        div(`"${x.historico}": parte de ${reais(x.credito + x.debito)} não confere com ${x.participacao}% de ${reais(bruto)} (${reais(esperado)}).`);
    }
  }
  if (parcial)
    ap.push({ tipo: "aviso", texto: "Nem todos os proprietários deste contrato estão nos arquivos: cada parte foi conferida pelo percentual." });
  for (const r of repasses) {
    const liquido = r.linhas.reduce((n, l) => n + l.credito - l.debito, 0);
    if (liquido !== r.pago)
      div(`${r.proprietario}: valor pago ${reais(r.pago)} diferente do líquido do extrato ${reais(liquido)}.`);
  }

  if (modo === "pre-cadastro") {
    const igual =
      recibo &&
      simples(recibo.locador) === simples(r0.proprietario) &&
      simples(recibo.endereco) === simples(r0.endereco);
    if (!igual) {
      ap.push({
        tipo: "manual",
        texto: "Pré-cadastro: sem recibo com o mesmo proprietário, endereço e contrato. Analisar manualmente.",
      });
      return;
    }
    if (linhas.some((l) => ehPagamentoAdm(l.historico) || ehIntermediacao(l.historico)))
      div("Pré-cadastro: não pode haver retenção de taxa ADM ou de intermediação.");
  }

  // Taxa: intermediação (primeiro aluguel, 100% do aluguel) ou ADM.
  const intermediacao = linhas.find((l) => ehIntermediacao(l.historico));
  const adm = linhas.find((l) => ehPagamentoAdm(l.historico));
  const aluguel = linhas.filter((l) => ehAluguel(l.historico)).reduce((n, l) => n + l.bruto, 0);
  if (intermediacao) {
    if (intermediacao.bruto !== aluguel)
      ap.push({
        tipo: "manual",
        texto: `Taxa de intermediação de ${reais(intermediacao.bruto)} diferente de 100% do aluguel (${reais(aluguel)}): conferir manualmente.`,
      });
  } else if (modo !== "pre-cadastro" && aluguel > 0) {
    if (!adm) div("Taxa ADM não descontada.");
    else if (r0.taxaAdm === null) ap.push({ tipo: "manual", texto: "Percentual da taxa ADM não encontrado no extrato." });
    else {
      const esperada = taxaAdmEsperada(linhas, r0.taxaAdm);
      if (adm.bruto !== esperada)
        div(`Taxa ADM de ${reais(adm.bruto)}; o esperado é ${reais(esperada)} ((aluguel − abono + multa) × ${(r0.taxaAdm / 10000).toLocaleString("pt-BR")}%).`);
    }
  }

  if (!recibo) return;

  // Cada lançamento do recibo é procurado no repasse pelo valor e pelo sentido (crédito/débito).
  const livres = new Set(linhas.filter((l) => !ehPagamentoAdm(l.historico) && !ehIntermediacao(l.historico)));
  const tirar = (valor: number, credito: boolean, historico: string) => {
    const candidatos = [...livres].filter((l) => l.bruto === valor && (credito ? l.credito > 0 : l.debito > 0));
    const achado = candidatos.find((l) => simples(l.historico).startsWith(simples(historico).slice(0, 4))) ?? candidatos[0];
    if (achado) livres.delete(achado);
    return achado;
  };

  for (const l of recibo.linhas) {
    const h = l.historico;
    const valor = l.debito || l.credito;
    // Abono e IRRF são crédito ao inquilino e débito ao proprietário; o resto é o contrário.
    const vaiComoCredito = l.debito > 0;
    if (ehDiferenca(h)) {
      // Se também estiver no extrato, o apontamento manual já sai pelas linhas do extrato.
      if (!tirar(valor, vaiComoCredito, h))
        ap.push({ tipo: "manual", texto: `"${h}" (${reais(valor)}) no recibo: conferir manualmente.` });
      continue;
    }
    const retido = ehRetidoNoRecibo(h) || (modo === "special" && !repassaEmSpecial(h));
    const naoRepassaMulta = ehMulta(h) && !!intermediacao;
    if (retido || naoRepassaMulta) {
      if (tirar(valor, vaiComoCredito, h)) {
        // Seguro normalmente fica retido, mas há casos em que é repassado: decisão manual.
        if (ehSeguro(h))
          ap.push({ tipo: "manual", texto: `Seguro repassado ("${h}", ${reais(valor)}): verificar se é um caso de repasse.` });
        else
          div(
            naoRepassaMulta
              ? `Multa repassada (${reais(valor)}), mas o contrato cobra taxa de intermediação: a multa deveria ficar retida.`
              : `"${h}" (${reais(valor)}) foi repassado, mas deveria ficar retido.`,
          );
      }
      continue;
    }
    if (!tirar(valor, vaiComoCredito, h))
      div(
        ehAbono(h) || ehIrrf(h)
          ? `"${h}" de ${reais(valor)} não foi debitado do proprietário.`
          : `"${h}" de ${reais(valor)} não foi repassado ao proprietário.`,
      );
  }

  for (const l of livres)
    if (ehDiferenca(l.historico)) continue;
    else if (l.credito > 0) div(`Crédito ao proprietário sem correspondente no recibo: "${l.historico}" ${reais(l.bruto)}.`);
    else if (!ehDebitoPrevisto(l.historico))
      ap.push({ tipo: "aviso", texto: `Débito ao proprietário sem origem no recibo: "${l.historico}" ${reais(l.bruto)}.` });
}

export function conferir(todosRecibos: Recibo[], todosRepasses: Repasse[]): Caso[] {
  // O mesmo recibo/extrato pode vir em dois arquivos enviados: cópia idêntica não é duplicidade.
  const unicosPor = <T>(itens: T[], id: (x: T) => string) =>
    itens.filter((x, i) => itens.findIndex((y) => id(y) === id(x)) === i);
  const recibos = unicosPor(todosRecibos, (r) => JSON.stringify({ ...r, arquivo: "", pagina: 0 }));
  const repasses = unicosPor(todosRepasses, (r) => `${r.numero}|${r.proprietario}`);
  const chave = (contrato: string, vencimento: string) => `${contrato}|${vencimento}`;
  const grupos = new Map<string, { recibos: Recibo[]; repasses: Repasse[] }>();
  const grupo = (k: string) => grupos.get(k) ?? grupos.set(k, { recibos: [], repasses: [] }).get(k)!;
  for (const r of recibos) grupo(chave(r.contrato, r.vencimento)).recibos.push(r);
  for (const r of repasses) grupo(chave(r.contrato, r.vencimento)).repasses.push(r);

  // Mais de um repasse para o mesmo contrato, competência e proprietário: grave.
  const porCompetencia = new Map<string, number>();
  for (const r of repasses) {
    const k = `${r.contrato}|${r.competencia}|${simples(r.proprietario)}`;
    porCompetencia.set(k, (porCompetencia.get(k) ?? 0) + 1);
  }

  const casos: Caso[] = [];
  for (const [k, g] of grupos) {
    const [contrato, vencimento] = k.split("|");
    const ap: Apontamento[] = [];
    const r0 = g.repasses[0];
    const recibo = g.recibos[0] ?? null;

    if (g.recibos.length > 1) ap.push({ tipo: "manual", texto: "Mais de um recibo com o mesmo contrato e vencimento." });
    // Um extrato por proprietário; o mesmo proprietário duas vezes é repasse em duplicidade.
    const duplicados = g.repasses.filter(
      (r) => (porCompetencia.get(`${r.contrato}|${r.competencia}|${simples(r.proprietario)}`) ?? 0) > 1,
    );
    if (duplicados.length)
      ap.push({
        tipo: "divergencia",
        texto: `Mais de um repasse na competência ${duplicados[0].competencia} para o mesmo contrato e proprietário (${[...new Set(duplicados.map((r) => r.proprietario))].join(", ")}).`,
      });
    const unicos = g.repasses.filter((r, i, a) => a.findIndex((x) => simples(x.proprietario) === simples(r.proprietario)) === i);

    // Sem o outro lado nos arquivos enviados: separado das divergências, porque pode ser só arquivo faltando.
    let semPar: Caso["status"] | null = null;
    if (!r0) {
      const outro = repasses.find((r) => r.contrato === contrato);
      if (outro)
        ap.push({ tipo: "divergencia", texto: `Vencimento diferente: recibo ${vencimento}, extrato de repasse ${outro.vencimento}.` });
      else semPar = "sem_extrato";
    } else if (!recibo && !simples(r0.situacao).includes("garantido") && !simples(r0.situacao).includes("precadastro")) {
      const outro = recibos.find((r) => r.contrato === contrato);
      if (outro)
        ap.push({ tipo: "divergencia", texto: `Vencimento diferente: extrato de repasse ${vencimento}, recibo ${outro.vencimento}.` });
      else semPar = "sem_recibo";
    } else conferirPar(recibo, unicos, ap);

    casos.push({
      contrato,
      vencimento,
      competencia: r0?.competencia ?? "",
      situacao: r0?.situacao ?? "",
      inquilino: recibo?.locatario || r0?.inquilino || "",
      proprietarios: unicos.map((r) => r.proprietario),
      onde: [...g.recibos, ...g.repasses].map((r) => `${r.arquivo}, pág. ${r.pagina}`).filter((x, i, a) => a.indexOf(x) === i),
      status: ap.some((a) => a.tipo === "divergencia")
        ? "divergencia"
        : ap.some((a) => a.tipo === "manual")
          ? "manual"
          : (semPar ?? "ok"),
      apontamentos: ap,
    });
  }
  const ordem = { divergencia: 0, manual: 1, sem_extrato: 2, sem_recibo: 3, ok: 4 };
  return casos.sort((a, b) => ordem[a.status] - ordem[b.status] || Number(a.contrato) - Number(b.contrato));
}
