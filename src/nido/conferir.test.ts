import { describe, expect, it } from "vitest";
import { conferir, taxaAdmEsperada, totais } from "./conferir";
import type { LinhaRepasse, Recibo, Repasse } from "./ler";

const V = "05/11/2026";
const recibo = (linhas: [string, number, number][], extra: Partial<Recibo> = {}): Recibo => ({
  arquivo: "recibos.pdf",
  pagina: 1,
  contrato: "100",
  locatario: "INQUILINO",
  locador: "DONO",
  endereco: "R Exemplo Nº 1",
  vencimento: V,
  linhas: linhas.map(([historico, debito, credito]) => ({ vencimento: V, historico, debito, credito })),
  pago: linhas.reduce((n, [, d, c]) => n + d - c, 0),
  ...extra,
});
// [histórico, bruto, crédito? (senão débito), participação]
const repasse = (linhas: [string, number, boolean, number?][], extra: Partial<Repasse> = {}): Repasse => {
  const ls: LinhaRepasse[] = linhas.map(([historico, bruto, credito, part = 1]) => {
    const v = Math.round(bruto * part);
    const participacao = (part * 100).toFixed(2).replace(".", ",");
    return { vencimento: V, historico, bruto, participacao, debito: credito ? 0 : v, credito: credito ? v : 0 };
  });
  return {
    arquivo: "repasses.pdf",
    pagina: 1,
    proprietario: "DONO",
    banco: "",
    contrato: "100",
    endereco: "R Exemplo Nº 1",
    situacao: "Normal",
    taxaAdm: 50000,
    inquilino: "INQUILINO",
    numero: "1",
    competencia: "10/2026",
    vencimento: V,
    linhas: ls,
    pago: ls.reduce((n, l) => n + l.credito - l.debito, 0),
    ...extra,
  };
};
// toLocaleString usa espaço não separável em "R$ 1,00".
const textos = (r: Recibo[], p: Repasse[]) =>
  conferir(r, p).flatMap((c) => c.apontamentos.map((a) => `${a.tipo}: ${a.texto}`.replace(/ /g, " ")));
const status = (r: Recibo[], p: Repasse[]) => conferir(r, p).map((c) => c.status);

const RECIBO_NORMAL = recibo([
  ["Aluguel 03/12", 200000, 0],
  ["Taxa de Expediente", 750, 0],
  ["IPTU 2026 10/10", 30000, 0],
  ["Condomínio", 50000, 0],
]);
const REPASSE_NORMAL = repasse([
  ["Aluguel 03/12", 200000, true],
  ["IPTU 2026 10/10", 30000, true],
  ["Condomínio", 50000, true],
  ["Taxa ADM./Aluguel", 10000, false],
]);

describe("taxa ADM", () => {
  it("é (aluguel − abono + multa) × %, arredondada meio-para-cima", () => {
    const linhas = repasse([
      ["Aluguel", 285235, true],
      ["Abono Aluguel 6/12", 35235, false],
      ["Multa Ref. 09/2026", 27539, true],
    ]).linhas;
    expect(taxaAdmEsperada(linhas, 70000)).toBe(19428); // caso real conferido
    expect(taxaAdmEsperada(repasse([["Aluguel", 1375390, true]]).linhas, 500000)).toBe(687695); // 50% → exato
    expect(taxaAdmEsperada(repasse([["Aluguel", 13753, true]]).linhas, 50000)).toBe(688); // 687,65 → 688
  });

  it("não inclui Aluguel Gerador nem manutenção na base", () => {
    const linhas = repasse([
      ["Aluguel 11/12 - Ref. 16/10/2026 a 15/11/2026", 250000, true],
      ["Aluguel Gerador", 2016, true],
      ["Manutenção Elevador 2/4", 750000, false],
    ]).linhas;
    expect(taxaAdmEsperada(linhas, 60000)).toBe(15000); // 2.500,00 × 6%, como o NIDO
  });

  it("abono de benfeitoria não diminui a base", () => {
    const linhas = repasse([
      ["Aluguel 05/12 - Ref. 12/10/2026 a 11/11/2026", 300000, true],
      ["Abono/ Benfeitoria 4/4", 300000, false],
    ]).linhas;
    expect(taxaAdmEsperada(linhas, 50000)).toBe(15000); // 3.000,00 × 5%, como o NIDO
  });
});

describe("conferência recibo × repasse", () => {
  it("diz em qual arquivo e página está cada lado, e de onde veio no PDF juntado", () => {
    const [c] = conferir([RECIBO_NORMAL], [{ ...REPASSE_NORMAL, arquivo: "juntado.pdf", pagina: 3, origem: "extrato-8.pdf, pág. 1" }]);
    expect(c.onde).toEqual([
      "Recibo: recibos.pdf, pág. 1",
      "Extrato: juntado.pdf, pág. 3 (no juntado, veio de extrato-8.pdf, pág. 1)",
    ]);
  });

  it("situação Normal correta: sem apontamentos", () => {
    expect(textos([RECIBO_NORMAL], [REPASSE_NORMAL])).toEqual([]);
    expect(status([RECIBO_NORMAL], [REPASSE_NORMAL])).toEqual(["ok"]);
  });

  it("soma os repasses: Bradesco separado, todos os outros bancos no Itaú", () => {
    const r = (n: string, valor: number, banco: string) => repasse([["Aluguel", valor, true]], { contrato: n, numero: n, banco });
    const casos = conferir([], [
      r("1", 100000, "BRADESCO"),
      r("2", 30000, "SANTANDER"),
      r("3", 50000, "Banco Bradesco S.A."),
      r("4", 20000, "INTER"),
      r("5", 10000, "ITAU"),
      r("6", 7000, ""),
    ]);
    expect(totais(casos)).toMatchObject({
      geral: 217000,
      repasses: 6,
      bancos: [
        { banco: "BRADESCO", valor: 150000, repasses: 2, bancos: ["BRADESCO", "Banco Bradesco S.A."] },
        { banco: "ITAÚ", valor: 60000, repasses: 3, bancos: ["SANTANDER", "INTER", "ITAU"] },
        { banco: "", valor: 7000, repasses: 1, bancos: [] },
      ],
      semBanco: [{ chave: "6|DONO", valor: 7000, conta: null }],
    });
    // Escolhido Bradesco para o repasse sem banco: sai da linha à parte e soma no Bradesco.
    expect(totais(casos, { "6|DONO": "BRADESCO" })).toMatchObject({
      geral: 217000,
      bancos: [
        { banco: "BRADESCO", valor: 157000, repasses: 3 },
        { banco: "ITAÚ", valor: 60000, repasses: 3 },
      ],
      semBanco: [{ chave: "6|DONO", conta: "BRADESCO" }],
    });
  });

  it("registra o que foi conferido para o relatório", () => {
    const [c] = conferir([RECIBO_NORMAL], [REPASSE_NORMAL]);
    expect(c.conferidos.map((t) => t.replace(/ /g, " "))).toEqual([
      "DONO: valor pago/a repassar R$ 2.700,00 igual ao líquido do extrato.",
      "Taxa ADM de R$ 100,00 = (aluguel − abono + multa) × 5%.",
      '"Aluguel 03/12" de R$ 2.000,00 repassado ao proprietário.',
      '"Taxa de Expediente" de R$ 7,50 retido (não vai ao proprietário).',
      '"IPTU 2026 10/10" de R$ 300,00 repassado ao proprietário.',
      '"Condomínio" de R$ 500,00 repassado ao proprietário.',
    ]);
  });

  it("aponta IPTU, condomínio e multa não repassados", () => {
    const r = recibo([
      ["Aluguel", 200000, 0],
      ["IPTU", 30000, 0],
      ["Condomínio", 50000, 0],
      ["Multa", 4000, 0],
    ]);
    const p = repasse([
      ["Aluguel", 200000, true],
      ["Taxa ADM./Aluguel", 10000, false],
    ]);
    expect(textos([r], [p])).toEqual([
      'divergencia: "IPTU" de R$ 300,00 não foi repassado ao proprietário.',
      'divergencia: "Condomínio" de R$ 500,00 não foi repassado ao proprietário.',
      'divergencia: "Multa" de R$ 40,00 não foi repassado ao proprietário.',
    ]);
  });

  it("aponta taxa ADM ausente ou com valor errado", () => {
    const sem = repasse([["Aluguel 03/12", 200000, true], ["IPTU 2026 10/10", 30000, true], ["Condomínio", 50000, true]]);
    expect(textos([RECIBO_NORMAL], [sem])).toEqual(["divergencia: Taxa ADM não descontada."]);
    const errada = repasse([
      ["Aluguel 03/12", 200000, true],
      ["IPTU 2026 10/10", 30000, true],
      ["Condomínio", 50000, true],
      ["Taxa ADM./Aluguel", 12000, false],
    ]);
    expect(textos([RECIBO_NORMAL], [errada])[0]).toMatch(/Taxa ADM de R\$ 120,00; o esperado é R\$ 100,00/);
  });

  it("taxa de expediente repassada é divergência", () => {
    const p = repasse([...REPASSE_NORMAL.linhas.map((l) => [l.historico, l.bruto, l.credito > 0] as [string, number, boolean]), ["Taxa de Expediente", 750, true]]);
    expect(textos([RECIBO_NORMAL], [p])).toEqual(['divergencia: "Taxa de Expediente" (R$ 7,50) foi repassado, mas deveria ficar retido.']);
  });

  it("abono e IRRF são débito ao proprietário", () => {
    const r = recibo([
      ["Aluguel", 200000, 0],
      ["Abono Aluguel 1/2", 0, 20000],
      ["IRRF (Imposto de Renda Retido na Fonte)", 0, 5000],
    ]);
    const ok = repasse([
      ["Aluguel", 200000, true],
      ["Abono Aluguel 1/2", 20000, false],
      ["IRRF (Imposto de Renda Retido na Fonte)", 5000, false],
      ["Taxa ADM./Aluguel", 9000, false],
    ]);
    expect(textos([r], [ok])).toEqual([]);
    const semAbono = repasse([
      ["Aluguel", 200000, true],
      ["IRRF (Imposto de Renda Retido na Fonte)", 5000, false],
      ["Taxa ADM./Aluguel", 10000, false],
    ]);
    expect(textos([r], [semAbono])).toEqual(['divergencia: "Abono Aluguel 1/2" de R$ 200,00 não foi debitado do proprietário.']);
  });

  it("intermediação: 100% do primeiro aluguel e multa não repassada", () => {
    const r = recibo([["Aluguel 01/12", 140000, 0], ["Multa", 2000, 0]]);
    const ok = repasse([["Aluguel 01/12", 140000, true], ["Taxa Intermediação", 140000, false]]);
    expect(textos([r], [ok])).toEqual([]);
    const comMulta = repasse([["Aluguel 01/12", 140000, true], ["Multa Ref.", 2000, true], ["Taxa Intermediação", 140000, false]]);
    expect(textos([r], [comMulta])[0]).toMatch(/^divergencia: Multa repassada/);
    const diferente = repasse([["Aluguel 01/12", 140000, true], ["Taxa Intermediação", 70000, false]]);
    expect(status([r], [diferente])).toEqual(["manual"]);
  });

  it("Contas PG Special: retém condomínio e IPTU, repassa aluguel e multa, e vai para conferência manual", () => {
    const r = recibo([["Aluguel", 200000, 0], ["Condomínio", 50000, 0], ["IPTU", 30000, 0], ["Multa", 4000, 0]]);
    const ok = repasse(
      [["Aluguel", 200000, true], ["Multa Ref.", 4000, true], ["Taxa ADM./Aluguel", 10200, false]],
      { situacao: "Contas PG Special" },
    );
    expect(textos([r], [ok])).toEqual([
      "manual: Situação Contas PG Special: conferir manualmente (valores checados abaixo).",
    ]);
    const repassouCond = repasse(
      [["Aluguel", 200000, true], ["Multa Ref.", 4000, true], ["Condomínio", 50000, true], ["Taxa ADM./Aluguel", 10200, false]],
      { situacao: "Contas PG Special" },
    );
    expect(textos([r], [repassouCond])).toContain('divergencia: "Condomínio" (R$ 500,00) foi repassado, mas deveria ficar retido.');
  });

  it("Jurídico e situação desconhecida vão para conferência manual sem outras regras", () => {
    const p = repasse([["Aluguel", 1, true]], { situacao: "Jurídico" });
    expect(textos([RECIBO_NORMAL], [p])).toEqual(["manual: Situação Jurídico: analisar manualmente."]);
    expect(status([RECIBO_NORMAL], [{ ...p, situacao: "Outra Coisa" }])).toEqual(["manual"]);
  });

  it("aluguel garantido: repasse sem recibo é normal", () => {
    const p = repasse([["Aluguel", 200000, true], ["Taxa ADM./Aluguel", 10000, false]], { situacao: "Aluguel Garantido" });
    expect(status([], [p])).toEqual(["ok"]);
    expect(status([], [{ ...p, situacao: "Normal" }])).toEqual(["sem_recibo"]);
  });

  it("sem par nos arquivos fica separado; vencimento diferente é divergência", () => {
    expect(status([RECIBO_NORMAL], [])).toEqual(["sem_extrato"]);
    expect(status([], [REPASSE_NORMAL])).toEqual(["sem_recibo"]);
    expect(textos([RECIBO_NORMAL], [])).toEqual([]);
    const outroVenc = { ...REPASSE_NORMAL, vencimento: "06/11/2026" };
    expect(textos([RECIBO_NORMAL], [outroVenc])[0]).toMatch(/^divergencia: Vencimento diferente/);
    // Repasse em duplicidade continua grave mesmo sem recibo enviado.
    expect(status([], [REPASSE_NORMAL, { ...REPASSE_NORMAL, numero: "2" }])).toEqual(["divergencia"]);
  });

  it("dois repasses na mesma competência para o mesmo contrato e proprietário", () => {
    const outro = { ...REPASSE_NORMAL, numero: "2" };
    expect(textos([RECIBO_NORMAL], [REPASSE_NORMAL, outro])[0]).toMatch(/^divergencia: Mais de um repasse na competência 10\/2026/);
  });

  it("o mesmo recibo/extrato em dois arquivos não é duplicidade", () => {
    const copiaRecibo = { ...RECIBO_NORMAL, arquivo: "outro.pdf", pagina: 9 };
    const copiaRepasse = { ...REPASSE_NORMAL, arquivo: "outro.pdf", pagina: 9 };
    expect(textos([RECIBO_NORMAL, copiaRecibo], [REPASSE_NORMAL, copiaRepasse])).toEqual([]);
  });

  it("vários proprietários: tolera 1 centavo de arredondamento por proprietário", () => {
    const r = recibo([["Aluguel", 255402, 0]]);
    const dono = (nome: string, numero: string, aluguel: number, adm: number) => ({
      ...repasse([["Aluguel", 255402, true], ["Taxa ADM./Aluguel", 12770, false]]),
      proprietario: nome,
      numero,
      linhas: [
        { vencimento: V, historico: "Aluguel", bruto: 255402, participacao: "33,33", debito: 0, credito: aluguel },
        { vencimento: V, historico: "Taxa ADM./Aluguel", bruto: 12770, participacao: "33,33", debito: adm, credito: 0 },
      ],
      pago: aluguel - adm,
    });
    const ok = [dono("A", "1", 85134, 4257), dono("B", "2", 85134, 4257), dono("C", "3", 85133, 4257)];
    expect(textos([r], ok)).toEqual([]);
    const errado = [dono("A", "1", 85134, 4257), dono("B", "2", 85134, 4257), dono("C", "3", 85100, 4257)];
    expect(textos([r], errado)[0]).toMatch(/as partes dos proprietários somam/);
  });

  it("só um dos proprietários enviado: confere a parte dele pelo percentual", () => {
    const r = recibo([["Aluguel", 906027, 0]]);
    const so = (aluguel: number) => ({
      ...repasse([]),
      linhas: [
        { vencimento: V, historico: "Aluguel", bruto: 906027, participacao: "33,33", debito: 0, credito: aluguel },
        { vencimento: V, historico: "Taxa ADM./Aluguel", bruto: 45301, participacao: "33,33", debito: 15100, credito: 0 },
      ],
      pago: aluguel - 15100,
    });
    // Caso real: NIDO calcula 33,333…% (3.020,06) e imprime 33,33% (3.019,79).
    const [ok] = conferir([r], [so(302006)]);
    expect(ok.status).toBe("ok");
    expect(ok.apontamentos.map((a) => a.tipo)).toEqual(["aviso"]);
    expect(textos([r], [so(250000)])[0]).toMatch(/^divergencia: "Aluguel": parte de R\$ 2\.500,00 não confere com 33,33%/);
  });

  it("pré-cadastro: repassa sem taxa ADM quando recibo bate em proprietário, endereço e contrato", () => {
    const r = recibo([["Depósito Caução", 1050000, 0]]);
    const p = repasse([["Depósito Caução", 1050000, true]], { situacao: "PRE-CADASTRO" });
    expect(status([r], [p])).toEqual(["ok"]);
    expect(status([{ ...r, locador: "OUTRA PESSOA" }], [p])).toEqual(["manual"]);
    expect(status([], [p])).toEqual(["manual"]);
    const comAdm = repasse([["Depósito Caução", 1050000, true], ["Taxa ADM./Aluguel", 1000, false]], { situacao: "PRE-CADASTRO" });
    expect(status([r], [comAdm])).toEqual(["divergencia"]);
  });

  const linhasRecibo = (extra: [string, number, number][]) =>
    recibo([...RECIBO_NORMAL.linhas.map((l) => [l.historico, l.debito, l.credito] as [string, number, number]), ...extra]);
  const linhasRepasse = (extra: [string, number, boolean][]) =>
    repasse([...REPASSE_NORMAL.linhas.map((l) => [l.historico, l.bruto, l.credito > 0] as [string, number, boolean]), ...extra]);

  it("taxas pagas pelo inquilino ficam retidas", () => {
    const r = linhasRecibo([
      ["Serviço de Despachante", 5000, 0],
      ["Serviço Despachante Enel/Sabesp", 15000, 0], // caso real, contrato 15259
      ["Taxa Assinatura Digital", 3000, 0],
      ["Taxa Boleto", 350, 0],
      ["Matrícula Atualizada", 6000, 0],
      ["Seguro Incêndio 1/4", 7522, 0],
      ["Seguro Fiança 22/29", 9000, 0],
      ["Seguro Essencial 8/11", 5000, 0],
    ]);
    expect(textos([r], [REPASSE_NORMAL])).toEqual([]);
    expect(textos([r], [linhasRepasse([["Serviço de Despachante", 5000, true]])])).toEqual([
      'divergencia: "Serviço de Despachante" (R$ 50,00) foi repassado, mas deveria ficar retido.',
    ]);
  });

  it("seguro repassado vai para conferência manual", () => {
    const r = linhasRecibo([["Seguro Fiança 1/12", 9000, 0]]);
    expect(textos([r], [linhasRepasse([["Seguro Fiança 1/12", 9000, true]])])).toEqual([
      'manual: Seguro repassado ("Seguro Fiança 1/12", R$ 90,00): verificar se é um caso de repasse.',
    ]);
  });

  it("taxa de repasse, renovação e vistoria podem ser descontadas do proprietário", () => {
    const p = linhasRepasse([["Taxa de Repasse", 1000, false], ["Taxa de Renovação", 20000, false], ["Vistoria", 15000, false]]);
    expect(textos([RECIBO_NORMAL], [p])).toEqual([]);
  });

  it("lançamento com 'diferença' vai para conferência manual", () => {
    const r = linhasRecibo([["Diferença consumos outubro", 6077, 0]]);
    const p = linhasRepasse([["Diferença consumos outubro", 6077, true]]);
    expect(textos([r], [p])).toEqual(['manual: "Diferença consumos outubro" (R$ 60,77) no extrato: conferir manualmente.']);
    expect(textos([r], [REPASSE_NORMAL])).toEqual(['manual: "Diferença consumos outubro" (R$ 60,77) no recibo: conferir manualmente.']);
  });

  it("débito ao proprietário sem origem no recibo é só aviso", () => {
    const p = repasse([...REPASSE_NORMAL.linhas.map((l) => [l.historico, l.bruto, l.credito > 0] as [string, number, boolean]), ["Fundo de Reserva", 5500, false]]);
    const [caso] = conferir([RECIBO_NORMAL], [p]);
    expect(caso.status).toBe("ok");
    expect(caso.apontamentos[0].tipo).toBe("aviso");
  });
});
