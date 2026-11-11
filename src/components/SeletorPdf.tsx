import { useId, useState } from "react";

export type ArquivoLido<T> = { id: number; nome: string } & (
  | { estado: "lendo" }
  | { estado: "ok"; paginas: number; registros: T[] }
  | { estado: "erro"; mensagem: string }
);

type Props = {
  rotulo: string;
  /** Nome do registro no plural, para o resumo ("recibos", "extratos"). */
  plural: string;
  arquivos: ArquivoLido<unknown>[];
  desabilitado: boolean;
  aoSelecionar: (arquivos: File[]) => void;
  aoRemover: (id: number) => void;
};

export function SeletorPdf({ rotulo, plural, arquivos, desabilitado, aoSelecionar, aoRemover }: Props) {
  const id = useId();
  const [arrastando, setArrastando] = useState(false);
  const receber = (lista: FileList | null) => lista?.length && aoSelecionar([...lista]);
  const estado = arquivos.some((a) => a.estado === "erro") ? "erro" : arquivos.length ? "ok" : "vazio";

  return (
    <section
      className={`seletor ${arrastando ? "seletor--arrastando" : ""} seletor--${estado}`}
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

      {arquivos.length > 0 && (
        <ul className="seletor__lista">
          {arquivos.map((a) => (
            <li key={a.id}>
              <strong>{a.nome}</strong>
              {a.estado === "lendo" && <span role="status"> · lendo…</span>}
              {a.estado === "ok" && (
                <span>
                  {" "}
                  · {a.paginas} {a.paginas === 1 ? "página" : "páginas"} · {a.registros.length} {a.registros.length === 1 ? plural.replace(/s$/, "") : plural}
                </span>
              )}
              {a.estado === "erro" && (
                <span className="erro" role="alert">
                  {a.mensagem}
                </span>
              )}{" "}
              {a.estado !== "lendo" && (
                <button type="button" className="botao botao--texto" onClick={() => aoRemover(a.id)} disabled={desabilitado}>
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="seletor__dica">Arraste os PDFs exportados do NIDO aqui ou</p>
      <label className="botao botao--secundario" htmlFor={id}>
        {arquivos.length ? "Adicionar arquivos" : "Selecionar arquivos"}
      </label>
      <input
        id={id}
        className="visualmente-oculto"
        type="file"
        multiple
        accept="application/pdf,.pdf"
        disabled={desabilitado}
        onChange={(e) => {
          receber(e.target.files);
          e.target.value = ""; // permite escolher o mesmo arquivo de novo depois de removê-lo
        }}
      />
    </section>
  );
}
