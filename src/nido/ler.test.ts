import { describe, expect, it } from "vitest";
import { centavos, lerRecibos, lerRepasses } from "./ler";

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
Pagamento: Pagamento:   Transferência Bancária
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
  });
});
