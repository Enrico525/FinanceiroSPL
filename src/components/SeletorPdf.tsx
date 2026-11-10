import { useId, useState } from "react";
import type { DocumentoLido } from "../pdf/extrair";

export type Slot =
  | { estado: "vazio" }
  | { estado: "lendo"; nome: string }
  | { estado: "ok"; doc: DocumentoLido }
  | { estado: "erro"; nome: string; mensagem: string };

type Props = {
  rotulo: string;
  slot: Slot;
  desabilitado: boolean;
  aoSelecionar: (arquivo: File) => void;
  aoRemover: () => void;
};

const formatarTamanho = (b: number) =>
  b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

export function SeletorPdf({ rotulo, slot, desabilitado, aoSelecionar, aoRemover }: Props) {
  const id = useId();
  const [arrastando, setArrastando] = useState(false);

  const receber = (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    if (arquivos.length > 1) return alert("Selecione apenas um arquivo por documento.");
    aoSelecionar(arquivos[0]);
  };

  return (
    <section
      className={`seletor ${arrastando ? "seletor--arrastando" : ""} seletor--${slot.estado}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!desabilitado) setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        if (!desabilitado) receber(e.dataTransfer.files);
      }}
      aria-labelledby={`${id}-titulo`}
    >
      <h2 id={`${id}-titulo`}>{rotulo}</h2>

      {slot.estado === "vazio" && (
        <>
          <p className="seletor__dica">Arraste o PDF aqui ou</p>
          <label className="botao botao--secundario" htmlFor={id}>
            Selecionar arquivo
          </label>
          <input
            id={id}
            className="visualmente-oculto"
            type="file"
            accept="application/pdf,.pdf"
            disabled={desabilitado}
            onChange={(e) => receber(e.target.files)}
          />
        </>
      )}

      {slot.estado === "lendo" && (
        <p role="status">
          Lendo <strong>{slot.nome}</strong>…
        </p>
      )}

      {slot.estado === "ok" && (
        <>
          <dl className="seletor__info">
            <dt>Arquivo</dt>
            <dd>{slot.doc.nome}</dd>
            <dt>Tamanho</dt>
            <dd>{formatarTamanho(slot.doc.tamanho)}</dd>
            <dt>Páginas</dt>
            <dd>{slot.doc.paginas.length}</dd>
            <dt>Situação</dt>
            <dd>{slot.doc.possivelmenteDigitalizado ? "Pouco texto encontrado" : "Válido"}</dd>
          </dl>
          {slot.doc.possivelmenteDigitalizado && (
            <p className="alerta" role="alert">
              Este documento parece ser digitalizado (imagem). Quase nenhum texto pôde ser extraído, e a análise
              ficaria incompleta. O reconhecimento de texto (OCR) ainda não está disponível.
            </p>
          )}
        </>
      )}

      {slot.estado === "erro" && (
        <p className="erro" role="alert">
          <strong>{slot.nome}:</strong> {slot.mensagem}
        </p>
      )}

      {(slot.estado === "ok" || slot.estado === "erro") && (
        <button type="button" className="botao botao--texto" onClick={aoRemover} disabled={desabilitado}>
          Remover
        </button>
      )}
    </section>
  );
}
