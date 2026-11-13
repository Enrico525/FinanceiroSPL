// Junta PDFs no navegador copiando as páginas originais: o texto continua o mesmo, então o app lê o resultado.
import { PDFDocument } from "pdf-lib";
import { LIMITES } from "../../shared/contrato";
import { ErroLeitura, lerOrigens, type Origem } from "./extrair";

export async function juntarPdfs(arquivos: File[]): Promise<Uint8Array> {
  const destino = await PDFDocument.create();
  const origens: Origem[] = [];
  for (const arquivo of arquivos) {
    const origem = await PDFDocument.load(await arquivo.arrayBuffer());
    for (const pagina of await destino.copyPages(origem, origem.getPageIndices())) destino.addPage(pagina);
    // Se o arquivo já era um juntado, mantém os nomes originais de dentro dele.
    const internas = lerOrigens(origem.getSubject(), origem.getPageCount());
    origens.push(...(internas ?? [{ nome: arquivo.name, paginas: origem.getPageCount() }]));
  }
  // Fora desses limites o próprio app recusaria o arquivo juntado.
  if (destino.getPageCount() > LIMITES.paginasPorDocumento)
    throw new ErroLeitura(
      `Juntos, os PDFs têm ${destino.getPageCount()} páginas; o app lê até ${LIMITES.paginasPorDocumento} por arquivo. Junte em partes.`,
    );
  // A lista dos arquivos originais vai no campo "Assunto" do PDF; extrair.ts lê de volta.
  destino.setSubject(JSON.stringify(origens));
  const bytes = await destino.save();
  if (bytes.length > LIMITES.bytesPorArquivo)
    throw new ErroLeitura(`O PDF juntado passaria de ${LIMITES.bytesPorArquivo / 1024 / 1024} MB. Junte em partes.`);
  return bytes;
}
