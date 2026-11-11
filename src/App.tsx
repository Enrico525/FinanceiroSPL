import { useEffect, useRef, useState } from "react";
import { buscarUsuario, ErroApi, sair } from "./api";
import { lerPdf, ErroLeitura } from "./pdf/extrair";
import { lerRecibos, lerRepasses, type Recibo, type Repasse } from "./nido/ler";
import { conferir, type Caso } from "./nido/conferir";
import { SeletorPdf, type ArquivoLido } from "./components/SeletorPdf";
import { Resultado } from "./components/Resultado";
import { Login } from "./components/Login";

type Lado = "recibos" | "repasses";
/** geral: todos os extratos de uma vez. um: um extrato por vez, mantendo os recibos carregados. */
export type Modo = "geral" | "um";
type Arquivos = { recibos: ArquivoLido<Recibo>[]; repasses: ArquivoLido<Repasse>[] };
const VAZIO: Arquivos = { recibos: [], repasses: [] };

const LADOS = {
  recibos: { rotulo: "Recibos do Locatário", plural: "recibos", titulo: "Recibo do Locatário", ler: lerRecibos },
  repasses: { rotulo: "Extratos de Repasse", plural: "extratos", titulo: "Extrato de Repasse", ler: lerRepasses },
} as const;

export function App() {
  const [usuario, setUsuario] = useState<string | null>(null);
  const [desenvolvimento, setDesenvolvimento] = useState(false);
  const [avisoSair, setAvisoSair] = useState(false);
  const [erroSessao, setErroSessao] = useState<string | null>(null);
  const [naoLogado, setNaoLogado] = useState(false);
  const [arquivos, setArquivos] = useState<Arquivos>(VAZIO);
  const [casos, setCasos] = useState<Caso[] | null>(null);
  const [modo, setModo] = useState<Modo>("geral");
  const proximoId = useRef(0);

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
    setArquivos(VAZIO);
    setCasos(null);
  };

  // Limpeza de melhor esforço ao sair da página.
  useEffect(() => {
    window.addEventListener("pagehide", limparTudo);
    return () => window.removeEventListener("pagehide", limparTudo);
  }, []);

  // Atualiza um arquivo pelo id; se ele já foi removido, a leitura que terminou depois é descartada.
  const atualizar = (lado: Lado, id: number, novo: ArquivoLido<Recibo> | ArquivoLido<Repasse>) =>
    setArquivos((s) => ({ ...s, [lado]: s[lado].map((a) => (a.id === id ? novo : a)) }));

  const adicionar = async (lado: Lado, lista: File[]) => {
    const novos = lista.map((arquivo) => ({ id: ++proximoId.current, nome: arquivo.name, arquivo }));
    setArquivos((s) => ({
      ...s,
      [lado]: [...s[lado], ...novos.map(({ id, nome }) => ({ id, nome, estado: "lendo" as const }))],
    }));
    for (const { id, nome, arquivo } of novos) {
      try {
        const doc = await lerPdf(arquivo);
        if (doc.possivelmenteDigitalizado)
          throw new ErroLeitura(
            "Este PDF não tem texto (provavelmente foi gerado por “Imprimir”). Exporte o relatório direto do NIDO.",
          );
        const registros = LADOS[lado].ler(doc.paginas, nome);
        if (!registros.length)
          throw new ErroLeitura(`Nenhum “${LADOS[lado].titulo}” encontrado. Confira se este é o relatório certo do NIDO.`);
        atualizar(lado, id, { id, nome, estado: "ok", paginas: doc.paginas.length, registros } as ArquivoLido<Recibo>);
      } catch (e) {
        const mensagem = e instanceof ErroLeitura ? e.message : "Não foi possível ler o PDF.";
        atualizar(lado, id, { id, nome, estado: "erro", mensagem });
      }
    }
  };

  const remover = (lado: Lado, id: number) =>
    setArquivos((s) => ({ ...s, [lado]: s[lado].filter((a) => a.id !== id) }));

  const lidos = <T,>(lista: ArquivoLido<T>[]) => lista.flatMap((a) => (a.estado === "ok" ? a.registros : []));
  const todos = [...arquivos.recibos, ...arquivos.repasses];
  const prontos =
    !todos.some((a) => a.estado !== "ok") && lidos(arquivos.recibos).length > 0 && lidos(arquivos.repasses).length > 0;

  const iniciar = () => {
    setCasos(conferir(lidos(arquivos.recibos), lidos(arquivos.repasses)));
    // Os dados lidos não são mais necessários: só o resultado permanece. No modo "um", os recibos ficam
    // carregados para o próximo extrato.
    setArquivos(modo === "um" ? { recibos: arquivos.recibos, repasses: [] } : VAZIO);
  };

  const pedirLimpeza = () => {
    if (casos && !confirm("Começar uma nova conferência? O resultado atual não poderá ser recuperado.")) return;
    limparTudo();
  };

  const trocarModo = (novo: Modo) => {
    if (novo === modo) return;
    if ((casos || todos.length) && !confirm("Trocar de modo apaga os arquivos e o resultado atuais. Continuar?")) return;
    limparTudo();
    setModo(novo);
  };

  const encerrar = async () => {
    if (desenvolvimento && usuario?.includes("@")) return setAvisoSair(true); // login simulado
    if (casos && !confirm("Sair agora apaga o resultado da conferência. Continuar?")) return;
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
            <h1>Conferência de repasses</h1>
            <p className="subtitulo">
              Recibos do Locatário × Extratos de Repasse exportados do NIDO. Os PDFs são lidos e conferidos no seu
              computador: nada é enviado nem salvo.
            </p>

            <div className="modos" role="group" aria-label="Modo de conferência">
              <button type="button" className="modo" aria-pressed={modo === "geral"} onClick={() => trocarModo("geral")}>
                <strong>Conferência geral</strong>
                <span>Todos os recibos × todos os extratos de uma vez</span>
              </button>
              <button type="button" className="modo" aria-pressed={modo === "um"} onClick={() => trocarModo("um")}>
                <strong>Extratos separados</strong>
                <span>Os recibos ficam carregados; confira um ou vários extratos por vez</span>
              </button>
            </div>
            {modo === "um" && (
              <p className="alerta">
                Neste modo, repasse em dobro só é detectado entre os extratos da mesma conferência: o app não guarda as
                conferências anteriores.
              </p>
            )}

            {!casos && (
              <div className="seletores">
                {(["recibos", "repasses"] as const).map((lado) => (
                  <SeletorPdf
                    key={lado}
                    rotulo={LADOS[lado].rotulo}
                    plural={LADOS[lado].plural}
                    arquivos={arquivos[lado]}
                    desabilitado={false}
                    aoSelecionar={(f) => adicionar(lado, f)}
                    aoRemover={(id) => remover(lado, id)}
                  />
                ))}
              </div>
            )}

            <div className="acoes">
              {!casos ? (
                <button type="button" className="botao" disabled={!prontos} onClick={iniciar}>
                  Conferir
                </button>
              ) : modo === "um" ? (
                <>
                  <button type="button" className="botao" onClick={() => setCasos(null)}>
                    Conferir outros extratos
                  </button>
                  <button type="button" className="botao botao--secundario" onClick={pedirLimpeza}>
                    Trocar os recibos
                  </button>
                </>
              ) : (
                <button type="button" className="botao botao--secundario" onClick={pedirLimpeza}>
                  Nova conferência
                </button>
              )}
            </div>

            {casos && <Resultado casos={casos} modo={modo} />}
          </>
        )}
      </main>
    </>
  );
}
