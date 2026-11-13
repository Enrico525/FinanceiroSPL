// Leitura local de PDFs. O arquivo nunca sai do navegador; só o texto extraído é enviado.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { LIMITES } from "../../shared/contrato";

// Worker do PDF.js servido pelo próprio app (sem CDN externo).
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Página de um PDF juntado pelo app: de qual arquivo e página original ela veio. */
export type PaginaExtraida = { numero: number; texto: string; origem?: string };
export type Origem = { nome: string; paginas: number };

/** Lê a lista de arquivos gravada por juntarPdfs. Conteúdo do PDF: não confiável, validado e só usado como texto. */
export function lerOrigens(json: string | undefined, totalPaginas: number): Origem[] | undefined {
  try {
    const lista: unknown = JSON.parse(json ?? "");
    if (
      Array.isArray(lista) &&
      lista.every((o) => typeof o?.nome === "string" && o.nome.length <= 255 && Number.isInteger(o.paginas) && o.paginas > 0) &&
      lista.reduce((n: number, o: Origem) => n + o.paginas, 0) === totalPaginas
    )
      return lista as Origem[];
  } catch {
    // sem origem gravada: PDF comum
  }
  return undefined;
}

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
    const assunto = ((await doc.getMetadata()).info as { Subject?: unknown } | undefined)?.Subject;
    const origens = lerOrigens(typeof assunto === "string" ? assunto : undefined, doc.numPages); // gravado por juntarPdfs
    // Página n do juntado → "arquivo original, pág. k".
    const origemDe = (n: number) => {
      for (const o of origens ?? []) {
        if (n <= o.paginas) return `${o.nome}, pág. ${n}`;
        n -= o.paginas;
      }
    };
    const paginas: PaginaExtraida[] = [];
    for (let numero = 1; numero <= doc.numPages; numero++) {
      const pagina = await doc.getPage(numero);
      const conteudo = await pagina.getTextContent();
      const texto = conteudo.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("")
        .trim();
      paginas.push({ numero, texto, origem: origemDe(numero) });
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
