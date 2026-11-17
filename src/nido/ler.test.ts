import { describe, expect, it } from "vitest";
import { centavos, extratosNaoLidos, lerRecibos, lerRepasses, valorDigitado } from "./ler";

describe("valorDigitado", () => {
  it("aceita valor com ou sem ponto de milhar e centavos; recusa o resto", () => {
    expect(["2657,61", "2.657,61", " 1.728,49 ", "425", "10,5", "1.234.567,00"].map(valorDigitado)).toEqual([265761, 265761, 172849, 42500, 1050, 123456700]);
    expect(["", "abc", "2,657.61", "26.57,61", "-10,00", "1,234", "R$ 10,00"].map(valorDigitado)).toEqual([null, null, null, null, null, null, null]);
  });
});

// Texto no formato que o pdf.js extrai dos relatórios do NIDO (dados fictícios).
const RECIBO = `Special Administração de Bens Ltda Special Administração de Bens Ltda
Emissão:
11/11/2026
Recibo do Locatário
LOCATÁRIO. : FULANO DE TAL LOCATÁRIO. : FULANO DE TAL   (ID) - 1 (ID) - 1
Contrato 100 - R Exemplo Nº 1 Contrato 100 - R Exemplo Nº 1   - Und. 2, Bairro Cep: 00000-000 - São Paulo -SP - Und. 2, Bairro Cep: 00000-000 - São Paulo -SP   Tipo Imóvel: APARTAMENTO Tipo Imóvel: APARTAMENTO
LOCADOR. : BELTRANO SILVA LOCADOR. : BELTRANO SILVA   (ID) - 2 (ID) - 2
VENCIMENTO VENCIMENTO   HISTÓRICO HISTÓRICO   DÉBITO DÉBITO   CRÉDITO CRÉDITO
10/11/2026   Aluguel 03/12 - Ref. 10/10/2026 a 09/11/2026   2.581,07   0,00
Taxa de Expediente   7,50   0,00
Abono Aluguel 4/6   0,00   100,00
Total Lançamentos Total Lançamentos   2.488,57 2.488,57
10/11/2026   PAGAMENTO EFETUADO PAGAMENTO EFETUADO   0,00   2.488,57
Total Geral Total Geral   0,00 0,00 `;

const REPASSE = `Extrato de Repasse
BELTRANO SILVA - (ID: 2) CPF: 000.000.000-00 BELTRANO SILVA - (ID: 2) CPF: 000.000.000-00
Pagamento: Pagamento:   Transferência Bancária   Banco: Banco:   BANCO TESTE   Ag.: Ag.:   0001   Conta: Conta:   00000-0
Contrato 100 - R Exemplo Nº 1 Contrato 100 - R Exemplo Nº 1   - Und. 2, Bairro Cep: 00000-000 - São - Und. 2, Bairro Cep: 00000-000 - São
Paulo -SP Paulo -SP
Situação: Normal Situação: Normal
INQ.: CPF: 000.000.000-00 - FULANO DE TAL INQ.: CPF: 000.000.000-00 - FULANO DE TAL   Taxa Adm: 6,0000 % Taxa Adm: 6,0000 %
Repasse: Repasse:   360000 - Competência: 10/2026 360000 - Competência: 10/2026
VENCIMENTO VENCIMENTO   HISTÓRICO HISTÓRICO   BRUTO BRUTO   PARTICIPAÇÃO PARTICIPAÇÃO   DÉBITO DÉBITO   CRÉDITO CRÉDITO
10/11/2026   Aluguel 03/12 - Ref. 10/10/2026 a 09/11/2026   2.581,07   100,00%   0,00   2.581,07
10/11/2026   Taxa ADM./Aluguel   148,86   100,00%   148,86   0,00
10/11/2026   PAGAMENTO EFETUADO DOC: 1 PAGAMENTO EFETUADO DOC: 1   2.432,21   100,00%   2.432,21   0,00
Total Pago Total Pago   0,00 0,00   2.432,21 2.432,21 `;

describe("leitura NIDO", () => {
  it("converte valores para centavos", () => {
    expect(centavos("1.234,56")).toBe(123456);
    expect(centavos("0,07")).toBe(7);
    expect(centavos("-10,00")).toBe(-1000);
  });

  it("lê o recibo do locatário", () => {
    const [r] = lerRecibos([{ numero: 3, texto: RECIBO }]);
    expect(r).toMatchObject({
      pagina: 3,
      contrato: "100",
      locatario: "FULANO DE TAL",
      locador: "BELTRANO SILVA",
      vencimento: "10/11/2026",
      pago: 248857,
      endereco: "R Exemplo Nº 1 - Und. 2, Bairro Cep: 00000-000 - São Paulo -SP",
    });
    expect(r.linhas.map((l) => [l.historico, l.debito, l.credito])).toEqual([
      ["Aluguel 03/12 - Ref. 10/10/2026 a 09/11/2026", 258107, 0],
      ["Taxa de Expediente", 750, 0],
      ["Abono Aluguel 4/6", 0, 10000],
    ]);
  });

  it("lê o extrato de repasse com endereço quebrado em várias linhas", () => {
    const [r] = lerRepasses([{ numero: 1, texto: REPASSE }]);
    expect(r).toMatchObject({
      proprietario: "BELTRANO SILVA",
      banco: "BANCO TESTE",
      pagamento: { documento: "CPF: 000.000.000-00", forma: "Transferência Bancária", agencia: "0001", conta: "00000-0", tipoConta: "", descricao: "" },
      contrato: "100",
      situacao: "Normal",
      taxaAdm: 60000,
      inquilino: "FULANO DE TAL",
      numero: "360000",
      competencia: "10/2026",
      vencimento: "10/11/2026",
      pago: 243221,
      endereco: "R Exemplo Nº 1 - Und. 2, Bairro Cep: 00000-000 - São Paulo -SP",
    });
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[1]).toMatchObject({ historico: "Taxa ADM./Aluguel", bruto: 14886, debito: 14886 });
  });

  it("extrato com pagamento ainda aguardando efetivação", () => {
    const texto = REPASSE.replace(
      /^10\/11\/2026   PAGAMENTO EFETUADO.*$/m,
      "11/11/2026   PAGAMENTO AGUARDANDO EFETIVAÇÃO PAGAMENTO AGUARDANDO EFETIVAÇÃO   2.432,21   100,00%   2.432,21   0,00",
    );
    const [r] = lerRepasses([{ numero: 1, texto }]);
    expect(r.pago).toBe(243221);
    expect(r.linhas).toHaveLength(2);
    // Layout de 11/2026: a linha de pagamento e o Total Pendente juntos, com o mesmo valor.
    const comPendente = texto.replace(/^Total Pago.*$/m, "Total Pendente Contrato 100 Total Pendente Contrato 100   0,00 0,00   2.432,21 2.432,21 ");
    expect(lerRepasses([{ numero: 1, texto: comPendente }])[0].pago).toBe(243221);
  });

  it("extrato sem banco informado", () => {
    const texto = REPASSE.replace(/^Pagamento: .*$/m, "Pagamento: Pagamento:   Banco: Banco:   Ag.: Ag.:   Conta: Conta:");
    const [r] = lerRepasses([{ numero: 1, texto }]);
    expect(r.banco).toBe("");
    expect(r.pagamento).toEqual({ documento: "CPF: 000.000.000-00", forma: "", agencia: "", conta: "", tipoConta: "", descricao: "" });
  });

  it("dados bancários com tipo de conta e descrição quebrada em duas linhas", () => {
    const texto = REPASSE.replace(
      /^Pagamento: .*$/m,
      "Pagamento: Pagamento:   TED   Banco: Banco:   BANCO TESTE   Ag.: Ag.:   0001-9   Conta: Conta:   00000-0   Tipo conta: Tipo conta:   Poupança   Descrição: Descrição:   TITULAR CICRANO CPF\n111.111.111-11",
    );
    const [r] = lerRepasses([{ numero: 1, texto }]);
    expect(r.pagamento).toEqual({
      documento: "CPF: 000.000.000-00",
      forma: "TED",
      agencia: "0001-9",
      conta: "00000-0",
      tipoConta: "Poupança",
      descricao: "TITULAR CICRANO CPF 111.111.111-11",
    });
    expect(r).toMatchObject({ contrato: "100", pago: 243221, endereco: "R Exemplo Nº 1 - Und. 2, Bairro Cep: 00000-000 - São Paulo -SP" });
  });

  it("histórico quebrado em várias linhas, com os valores na última", () => {
    const texto = REPASSE.replace(
      /^10\/11\/2026   Aluguel 03\/12.*$/m,
      "10/11/2026   Acordo ref. aos boletos Alugueis- Ref. 02/08/2026 a\n01/10/2026 1/12 1/12\n2.581,07   100,00%   0,00   2.581,07",
    );
    const [r] = lerRepasses([{ numero: 1, texto }]);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({
      historico: "Acordo ref. aos boletos Alugueis- Ref. 02/08/2026 a 01/10/2026 1/12 1/12",
      bruto: 258107,
      credito: 258107,
    });
  });

  it("extrato ainda não pago: usa o crédito do Total Pendente", () => {
    const texto = REPASSE.replace(
      /^10\/11\/2026   PAGAMENTO EFETUADO[\s\S]*$/m,
      "Total de débitos e créditos Total de débitos e créditos   148,86 148,86   2.581,07 2.581,07\nTotal Pendente Contrato 100 Total Pendente Contrato 100   0,00 0,00   2.432,21 2.432,21 ",
    );
    const [r] = lerRepasses([{ numero: 1, texto }]);
    expect(r.pago).toBe(243221);
    expect(r.linhas).toHaveLength(2);
  });
});

describe("extratosNaoLidos (dupla checagem da leitura)", () => {
  const marcador = (c: string) => `Total Pendente Contrato ${c} Total Pendente Contrato ${c}   0,00 0,00   10,00 10,00`;
  it("bate quando cada marcador do texto virou um extrato lido", () => {
    const paginas = [{ numero: 1, texto: marcador("1") }, { numero: 2, texto: `${marcador("1")}\n${marcador("2")}` }];
    expect(extratosNaoLidos(paginas, [{ contrato: "1" }, { contrato: "1" }, { contrato: "2" }])).toBe("");
  });
  it("aponta extrato que ficou sem ler e o lido a mais", () => {
    const paginas = [{ numero: 1, texto: `${marcador("1")}\n${marcador("2")}` }];
    expect(extratosNaoLidos(paginas, [{ contrato: "1" }, { contrato: "3" }])).toBe("contrato 2 (1 não lido), contrato 3 (1 lido a mais)");
  });
});
