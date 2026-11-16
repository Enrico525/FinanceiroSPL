import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"; // build para Node
import { juntarPdfs } from "./juntar";
import { lerOrigens } from "./extrair";
import { LIMITES } from "../../shared/contrato";

async function pdfFicticio(...textos: string[]) {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of textos) doc.addPage().drawText(t, { x: 50, y: 700, font: fonte, size: 12 });
  return new File([(await doc.save()) as BlobPart], `${textos[0]}.pdf`);
}

async function textos(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes }).promise;
  const saida: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    saida.push(c.items.map((i) => ("str" in i ? i.str : "")).join(""));
  }
  return saida;
}

describe("juntar PDFs", () => {
  it("grava de qual arquivo veio cada página, inclusive juntando um juntado", async () => {
    const ab = await juntarPdfs([await pdfFicticio("A1", "A2"), await pdfFicticio("B1")]);
    const abc = await juntarPdfs([new File([ab as BlobPart], "ab.pdf"), await pdfFicticio("C1")]);
    const { info } = (await (await getDocument({ data: abc }).promise).getMetadata()) as { info: { Subject: string } };
    expect(lerOrigens(info.Subject, 4)).toEqual([
      { nome: "A1.pdf", paginas: 2 },
      { nome: "B1.pdf", paginas: 1 },
      { nome: "C1.pdf", paginas: 1 },
    ]);
  });

  it("ignora origem inválida ou que não bate com as páginas", () => {
    expect(lerOrigens('[{"nome":"a.pdf","paginas":2}]', 3)).toBeUndefined();
    expect(lerOrigens("<script>", 1)).toBeUndefined();
    expect(lerOrigens(undefined, 1)).toBeUndefined();
  });

  it("mantém a ordem e o texto das páginas", async () => {
    const junto = await juntarPdfs([await pdfFicticio("Extrato A1", "Extrato A2"), await pdfFicticio("Extrato B1")]);
    expect(await textos(junto)).toEqual(["Extrato A1", "Extrato A2", "Extrato B1"]);
  });

  it("junta 400 extratos de uma página e recusa passar do limite de páginas", async () => {
    const extratos = await Promise.all(Array.from({ length: 400 }, (_, i) => pdfFicticio(`Extrato ${i}`)));
    expect((await PDFDocument.load(await juntarPdfs(extratos))).getPageCount()).toBe(400);
    const n = LIMITES.paginasPorDocumento + 1;
    const grande = await pdfFicticio(...Array.from({ length: n }, (_, i) => `p${i}`));
    await expect(juntarPdfs([grande])).rejects.toThrow(new RegExp(`${n} páginas`));
  }, 60_000);
});
