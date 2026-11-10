// Leitura local de PDFs. O arquivo nunca sai do navegador; só o texto extraído é enviado.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { LIMITES } from "../../shared/contrato";

// Worker do PDF.js servido pelo próprio app (sem CDN externo).
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PaginaExtraida = { numero: number; texto: string };

export type DocumentoLido = {
  nome: string;
  tamanho: number;
  paginas: PaginaExtraida[];
  /** Pouco texto extraível: provavelmente digitalizado (OCR ainda não implementado). */
  possivelmenteDigitalizado: boolean;
};

export class ErroLeitura extends Error {}

export async function lerPdf(arquivo: File): Promise<DocumentoLido> {
  if (arquivo.size > LIMITES.bytesPorArquivo) {
    throw new ErroLeitura(`Arquivo acima do limite de ${LIMITES.bytesPorArquivo / 1024 / 1024} MB.`);
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  // Confere o conteúdo real, não a extensão.
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new ErroLeitura("O arquivo não é um PDF válido.");
  }

  const tarefa = pdfjs.getDocument({ data: bytes });
  try {
    const doc = await tarefa.promise;
    if (doc.numPages > LIMITES.paginasPorDocumento) {
      throw new ErroLeitura(`O documento tem ${doc.numPages} páginas; o limite é ${LIMITES.paginasPorDocumento}.`);
    }
    const paginas: PaginaExtraida[] = [];
    for (let numero = 1; numero <= doc.numPages; numero++) {
      const pagina = await doc.getPage(numero);
      const conteudo = await pagina.getTextContent();
      const texto = conteudo.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("")
        .trim();
      paginas.push({ numero, texto });
      pagina.cleanup();
    }
    const total = paginas.reduce((n, p) => n + p.texto.length, 0);
    return {
      nome: arquivo.name,
      tamanho: arquivo.size,
      paginas,
      possivelmenteDigitalizado: total / paginas.length < LIMITES.caracteresMinimosPorPagina,
    };
  } catch (e) {
    if (e instanceof ErroLeitura) throw e;
    const nome = (e as { name?: string })?.name;
    if (nome === "PasswordException") throw new ErroLeitura("O PDF está protegido por senha.");
    if (nome === "InvalidPDFException") throw new ErroLeitura("O PDF está corrompido ou é inválido.");
    throw new ErroLeitura("Não foi possível ler o PDF.");
  } finally {
    await tarefa.destroy(); // libera memória e o worker do PDF.js
  }
}
