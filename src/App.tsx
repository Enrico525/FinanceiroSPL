import { useEffect, useRef, useState } from "react";
import type { ResultadoAnalise } from "../shared/contrato";
import { analisar, buscarUsuario, ErroApi, sair } from "./api";
import { conferirReferencias } from "./conferencia";
import { lerPdf, ErroLeitura } from "./pdf/extrair";
import { SeletorPdf, type Slot } from "./components/SeletorPdf";
import { Resultado } from "./components/Resultado";
import { Login } from "./components/Login";

type Id = "A" | "B";
type Analise =
  | { fase: "ocioso" }
  | { fase: "enviando" }
  | { fase: "concluido"; resultado: ResultadoAnalise; conferidas: Set<string> }
  | { fase: "erro"; mensagem: string };

const VAZIO: Record<Id, Slot> = { A: { estado: "vazio" }, B: { estado: "vazio" } };

export function App() {
  const [usuario, setUsuario] = useState<string | null>(null);
  const [desenvolvimento, setDesenvolvimento] = useState(false);
  const [avisoSair, setAvisoSair] = useState(false);
  const [erroSessao, setErroSessao] = useState<string | null>(null);
  const [naoLogado, setNaoLogado] = useState(false);
  const [slots, setSlots] = useState<Record<Id, Slot>>(VAZIO);
  const [analise, setAnalise] = useState<Analise>({ fase: "ocioso" });
  const controlador = useRef<AbortController | null>(null);
  // Descarta leituras que terminaram depois de o arquivo ter sido removido/trocado.
  const geracao = useRef<Record<Id, number>>({ A: 0, B: 0 });

  useEffect(() => {
    buscarUsuario()
      .then((u) => {
        setUsuario(u.usuario);
        setDesenvolvimento(u.desenvolvimento);
      })
      .catch((e: Error) => {
        if (e instanceof ErroApi && e.codigo === "nao_autenticado") setNaoLogado(true);
        else setErroSessao(e.message);
      });
  }, []);

  const limparTudo = () => {
    controlador.current?.abort();
    controlador.current = null;
    geracao.current = { A: geracao.current.A + 1, B: geracao.current.B + 1 };
    setSlots(VAZIO);
    setAnalise({ fase: "ocioso" });
  };

  // Limpeza de melhor esforço ao sair da página.
  useEffect(() => {
    window.addEventListener("pagehide", limparTudo);
    return () => window.removeEventListener("pagehide", limparTudo);
  }, []);

  const selecionar = async (id: Id, arquivo: File) => {
    const minha = ++geracao.current[id];
    setSlots((s) => ({ ...s, [id]: { estado: "lendo", nome: arquivo.name } }));
    let novo: Slot;
    try {
      novo = { estado: "ok", doc: await lerPdf(arquivo) };
    } catch (e) {
      const mensagem = e instanceof ErroLeitura ? e.message : "Não foi possível ler o PDF.";
      novo = { estado: "erro", nome: arquivo.name, mensagem };
    }
    if (geracao.current[id] === minha) setSlots((s) => ({ ...s, [id]: novo }));
  };

  const remover = (id: Id) => {
    geracao.current[id]++;
    setSlots((s) => ({ ...s, [id]: { estado: "vazio" } }));
  };

  const { A, B } = slots;
  const prontos =
    A.estado === "ok" && B.estado === "ok" && !A.doc.possivelmenteDigitalizado && !B.doc.possivelmenteDigitalizado;

  const iniciar = async () => {
    if (A.estado !== "ok" || B.estado !== "ok") return;
    const textos = { A: A.doc.paginas, B: B.doc.paginas };
    controlador.current = new AbortController();
    setAnalise({ fase: "enviando" });
    try {
      const resultado = await analisar(
        { documentos: [{ id: "A", paginas: textos.A }, { id: "B", paginas: textos.B }] },
        controlador.current.signal,
      );
      const refs = [...resultado.itens.map((i) => i.referencia), ...resultado.divergencias.flatMap((d) => d.referencias)];
      setAnalise({ fase: "concluido", resultado, conferidas: conferirReferencias(refs, textos) });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = e instanceof ErroApi ? e.message : "Ocorreu um erro inesperado.";
      setAnalise({ fase: "erro", mensagem: `${msg} Selecione os documentos novamente para repetir.` });
    } finally {
      controlador.current = null;
      // Textos extraídos não são mais necessários: só o resultado permanece.
      geracao.current = { A: geracao.current.A + 1, B: geracao.current.B + 1 };
      setSlots(VAZIO);
    }
  };

  const pedirLimpeza = () => {
    if (analise.fase === "concluido" && !confirm("Limpar a análise? O resultado não poderá ser recuperado.")) return;
    limparTudo();
  };

  const ocupado = analise.fase === "enviando";

  const encerrar = async () => {
    if (desenvolvimento && usuario?.includes("@")) return setAvisoSair(true); // login simulado
    if (analise.fase === "concluido" && !confirm("Sair agora apaga o resultado da análise. Continuar?")) return;
    limparTudo();
    await sair().catch(() => undefined); // mesmo se falhar, a tela volta ao login; o cookie expira sozinho
    setUsuario(null);
    setNaoLogado(true);
  };

  if (naoLogado)
    return (
      <Login
        aoEntrar={(u) => {
          setUsuario(u);
          setNaoLogado(false);
          buscarUsuario().then((d) => setDesenvolvimento(d.desenvolvimento), () => undefined);
        }}
      />
    );
  // Não mostra a área interna antes de confirmar o login.
  if (!usuario && !erroSessao) return <p className="carregando" role="status">Carregando…</p>;

  return (
    <>
      <header className="topo">
        <img src="/marca/logo-login.png" alt="Special Imóveis" className="topo__logo" />
        <span className="topo__titulo">Conferência Financeira</span>
        <div className="topo__usuario">
          {desenvolvimento && <span className="selo">Desenvolvimento</span>}
          {usuario && <span>{usuario}</span>}
          <button type="button" className="botao botao--texto" onClick={encerrar}>
            Sair
          </button>
        </div>
      </header>
      {avisoSair && (
        <p className="alerta aviso-topo" role="status">
          O login simulado de desenvolvimento (DEV_EMAIL) está ativo, então não há sessão para encerrar. Para testar o
          login real localmente, deixe DEV_EMAIL vazio no .dev.vars.{" "}
          <button type="button" className="botao botao--texto" onClick={() => setAvisoSair(false)}>
            Fechar
          </button>
        </p>
      )}

      <main className="conteudo">
        {erroSessao ? (
          <p className="erro" role="alert">
            {erroSessao}
          </p>
        ) : (
          <>
            <h1>Análise de documentos</h1>
            <p className="subtitulo">
              Os PDFs são lidos no seu computador. Apenas o texto extraído é enviado para análise, e nada é salvo.
            </p>

            {analise.fase !== "concluido" && (
              <div className="seletores">
                {(["A", "B"] as const).map((id) => (
                  <SeletorPdf
                    key={id}
                    rotulo={`Documento ${id}`}
                    slot={slots[id]}
                    desabilitado={ocupado}
                    aoSelecionar={(f) => selecionar(id, f)}
                    aoRemover={() => remover(id)}
                  />
                ))}
              </div>
            )}

            {analise.fase === "erro" && (
              <p className="erro" role="alert">
                {analise.mensagem}
              </p>
            )}

            <div className="acoes">
              {analise.fase !== "concluido" && !ocupado && (
                <button type="button" className="botao" disabled={!prontos} onClick={iniciar}>
                  Analisar documentos
                </button>
              )}
              {ocupado && (
                <>
                  <p role="status" className="status">
                    Analisando documentos. Isso pode levar até 2 minutos…
                  </p>
                  <button type="button" className="botao botao--secundario" onClick={limparTudo}>
                    Cancelar
                  </button>
                </>
              )}
              {(analise.fase === "concluido" || analise.fase === "erro") && (
                <button type="button" className="botao botao--secundario" onClick={pedirLimpeza}>
                  Limpar análise
                </button>
              )}
            </div>

            {analise.fase === "concluido" && <Resultado resultado={analise.resultado} conferidas={analise.conferidas} />}
          </>
        )}
      </main>
    </>
  );
}
