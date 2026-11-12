// Leitura do texto dos relatórios exportados pelo NIDO ("Recibo do Locatário" e "Extrato de Repasse").
// Depende do layout do NIDO: se o relatório mudar, os testes de ler.test.ts devem quebrar.
import type { PaginaExtraida } from "../pdf/extrair";

export type LinhaRecibo = { vencimento: string; historico: string; debito: number; credito: number };
export type Recibo = {
  arquivo: string;
  pagina: number;
  contrato: string;
  locatario: string;
  locador: string;
  endereco: string;
  vencimento: string;
  linhas: LinhaRecibo[];
  pago: number;
};

export type LinhaRepasse = {
  vencimento: string;
  historico: string;
  bruto: number;
  participacao: string;
  debito: number;
  credito: number;
};
export type Repasse = {
  arquivo: string;
  pagina: number;
  proprietario: string;
  /** Banco do repasse ao proprietário ("" quando o extrato não informa). */
  banco: string;
  contrato: string;
  endereco: string;
  situacao: string;
  /** Taxa ADM em décimos de milésimo de ponto percentual: "5,0000 %" → 50000. */
  taxaAdm: number | null;
  inquilino: string;
  numero: string;
  competencia: string;
  vencimento: string;
  linhas: LinhaRepasse[];
  pago: number;
};

const VALOR = String.raw`(-?[\d.]+,\d{2})`;
const DATA = String.raw`(\d{2}/\d{2}/\d{4})`;
const RE_RECIBO_LINHA = new RegExp(String.raw`^(?:${DATA}   )?(.+?)   ${VALOR}   ${VALOR}$`);
const RE_REPASSE_LINHA = new RegExp(String.raw`^${DATA}   (.+?)   ${VALOR}   ([\d,]+)%   ${VALOR}   ${VALOR}$`);
// "PAGAMENTO EFETUADO" (já pago) ou "PAGAMENTO AGUARDANDO EFETIVAÇÃO" (extrato pronto, repasse ainda não pago).
const PAGAMENTO = /^PAGAMENTO (EFETUADO|AGUARDANDO)/;
// Extrato ainda não pago: o valor a repassar vem só no total, na coluna crédito ("0,00   1.088,87").
const RE_PENDENTE = new RegExp(String.raw`^Total Pendente\b.*?   ${VALOR}   ${VALOR}$`);

/** "1.234,56" → 123456 (centavos, sem ponto flutuante). */
export function centavos(v: string): number {
  const negativo = v.startsWith("-");
  const [inteiro, dec] = v.replace(/^-/, "").replace(/\./g, "").split(",");
  const c = Number(inteiro) * 100 + Number(dec);
  return negativo ? -c : c;
}

/** "5,0000" → 50000. */
function taxa(v: string): number {
  const [inteiro, dec = ""] = v.split(",");
  return Number(inteiro) * 10000 + Number(dec.padEnd(4, "0").slice(0, 4));
}

// O NIDO escreve textos em negrito duas vezes ("Situação: Normal Situação: Normal"). Os blocos
// de uma linha vêm separados por 3 espaços; cada bloco repetido vira um só.
function semDuplicata(bloco: string): string {
  const t = bloco.trim();
  const meio = (t.length - 1) / 2;
  return Number.isInteger(meio) && t[meio] === " " && t.slice(0, meio) === t.slice(meio + 1) ? t.slice(0, meio) : t;
}

function* linhas(paginas: PaginaExtraida[]) {
  for (const p of paginas)
    for (const bruta of p.texto.split("\n")) {
      const linha = bruta.split("   ").map(semDuplicata).join("   ").trim();
      if (linha) yield { pagina: p.numero, linha };
    }
}

const CONTRATO = /^Contrato (\d+) - (.*)$/;

// Endereços longos quebram em várias linhas; o rótulo final ("Tipo Imóvel:" no recibo,
// "Situação:" no repasse) pode vir na mesma linha ou numa seguinte. Devolve o rótulo quando aparece.
function endereco(alvo: { endereco: string }, linha: string, rotulo: string): string | null {
  const i = linha.indexOf(rotulo);
  const parte = (i < 0 ? linha : linha.slice(0, i)).replace(/\s+/g, " ").trim();
  if (parte) alvo.endereco = `${alvo.endereco} ${parte}`.trim();
  return i < 0 ? null : linha.slice(i + rotulo.length).trim();
}

export function lerRecibos(paginas: PaginaExtraida[], arquivo = ""): Recibo[] {
  const recibos: Recibo[] = [];
  let atual: Recibo | null = null;
  let vencimento = "";
  let noEndereco = false;
  for (const { pagina, linha } of linhas(paginas)) {
    if (linha === "Recibo do Locatário") {
      atual = { arquivo, pagina, contrato: "", locatario: "", locador: "", endereco: "", vencimento: "", linhas: [], pago: 0 };
      recibos.push(atual);
      vencimento = "";
      noEndereco = false;
      continue;
    }
    if (!atual) continue;
    let m: RegExpMatchArray | null;
    if ((m = linha.match(/^LOCATÁRIO\. : (.+?)   \(ID\)/))) atual.locatario = m[1];
    else if ((m = linha.match(/^LOCADOR\. : (.+?)   \(ID\)/))) {
      atual.locador = m[1];
      noEndereco = false;
    } else if ((m = linha.match(CONTRATO))) {
      atual.contrato = m[1];
      noEndereco = endereco(atual, m[2], "Tipo Imóvel:") === null;
    } else if (noEndereco) noEndereco = endereco(atual, linha, "Tipo Imóvel:") === null;
    else if ((m = linha.match(RE_RECIBO_LINHA))) {
      const [, data, historico, deb, cred] = m;
      if (data) vencimento = data;
      if (PAGAMENTO.test(historico)) atual.pago += centavos(cred);
      else {
        if (!atual.vencimento) atual.vencimento = vencimento;
        atual.linhas.push({ vencimento, historico, debito: centavos(deb), credito: centavos(cred) });
      }
    }
  }
  return recibos;
}

export function lerRepasses(paginas: PaginaExtraida[], arquivo = ""): Repasse[] {
  const repasses: Repasse[] = [];
  let proprietario = "";
  let banco = "";
  let atual: Repasse | null = null;
  for (const { pagina, linha } of linhas(paginas)) {
    let m: RegExpMatchArray | null;
    if ((m = linha.match(/^(.+?) - \(ID: \d+\)/))) {
      proprietario = m[1];
      banco = "";
    } else if (linha.startsWith("Pagamento:")) banco = linha.match(/Banco:   (.+?)   Ag\.:/)?.[1] ?? "";
    else if ((m = linha.match(CONTRATO))) {
      atual = {
        arquivo,
        pagina,
        proprietario,
        banco,
        contrato: m[1],
        endereco: "",
        situacao: "",
        taxaAdm: null,
        inquilino: "",
        numero: "",
        competencia: "",
        vencimento: "",
        linhas: [],
        pago: 0,
      };
      repasses.push(atual);
      atual.situacao = endereco(atual, m[2], "Situação:") ?? "";
    } else if (!atual) continue;
    else if ((m = linha.match(/^INQ\.: .*? - (.+?)(?:   Taxa Adm: ([\d,]+) %)?$/))) {
      atual.inquilino = m[1];
      if (m[2]) atual.taxaAdm = taxa(m[2]);
    } else if ((m = linha.match(/^Repasse:   (\d+) - Competência: (\d{2}\/\d{4})/))) {
      atual.numero = m[1];
      atual.competencia = m[2];
    } else if ((m = linha.match(RE_PENDENTE))) atual.pago += centavos(m[2]) - centavos(m[1]);
    else if ((m = linha.match(RE_REPASSE_LINHA))) {
      const [, data, historico, bruto, part, deb, cred] = m;
      if (PAGAMENTO.test(historico)) atual.pago += centavos(deb);
      else {
        if (!atual.vencimento) atual.vencimento = data;
        atual.linhas.push({
          vencimento: data,
          historico,
          bruto: centavos(bruto),
          participacao: part,
          debito: centavos(deb),
          credito: centavos(cred),
        });
      }
    } else if (!atual.situacao && !atual.inquilino) atual.situacao = endereco(atual, linha, "Situação:") ?? "";
  }
  return repasses;
}
