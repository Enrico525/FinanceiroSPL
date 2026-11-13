import { useEffect, useMemo, useRef, useState } from "react";
import { buscarUsuario, ErroApi, sair } from "./api";
import { lerPdf, ErroLeitura } from "./pdf/extrair";
import { juntarPdfs } from "./pdf/juntar";
import { lerRecibos, lerRepasses, type Recibo, type Repasse } from "./nido/ler";
import { conferir, idRepasse } from "./nido/conferir";
import { SeletorPdf, type ArquivoLido } from "./components/SeletorPdf";
import { Resultado } from "./components/Resultado";
import { Login } from "./components/Login";

type Lado = "recibos" | "repasses";
/** geral: todos os extratos de uma vez. um: um extrato por vez, mantendo os recibos carregados. */
export type Modo = "geral" | "um";
type Pagina = Modo | "juntar";
const PAGINAS: { id: Pagina; nome: string; descricao: string }[] = [
  { id: "juntar", nome: "Juntar PDF", descricao: "Vários extratos de repasse em um PDF só" },
  { id: "um", nome: "Repasses únicos", descricao: "Recibos ficam carregados; confira um ou vários extratos por vez" },
  { id: "geral", nome: "Repasses juntados", descricao: "Todos os recibos × todos os extratos (ou o PDF juntado)" },
];
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
  // Dados lidos da conferência em tela (só em memória): permitem remover ou adicionar extratos e analisar de novo.
  const [base, setBase] = useState<{ recibos: Recibo[]; repasses: Repasse[] } | null>(null);
  const [removidos, setRemovidos] = useState<Set<string>>(new Set());
  const casos = useMemo(
    () => base && conferir(base.recibos, base.repasses.filter((r) => !removidos.has(idRepasse(r)))),
    [base, removidos],
  );
  const [pagina, setPagina] = useState<Pagina>("geral");
  const modo: Modo = pagina === "juntar" ? "geral" : pagina;
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
    setBase(null);
    setRemovidos(new Set());
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
        const registros = LADOS[lado]
          .ler(doc.paginas, nome)
          .map((r) => ({ ...r, origem: doc.paginas[r.pagina - 1]?.origem }));
        if (!registros.length)
          throw new ErroLeitura(`Nenhum “${LADOS[lado].titulo}” encontrado. Confira se este é o relatório certo do NIDO.`);
        const ok = { id, nome, estado: "ok", paginas: doc.paginas.length, registros, arquivo } as ArquivoLido<Recibo>;
        atualizar(lado, id, ok);
      } catch (e) {
        const mensagem = e instanceof ErroLeitura ? e.message : "Não foi possível ler o PDF.";
        atualizar(lado, id, { id, nome, estado: "erro", mensagem });
      }
    }
  };

  const remover = (lado: Lado, id: number) =>
    setArquivos((s) => ({ ...s, [lado]: s[lado].filter((a) => a.id !== id) }));

  // O PDF juntado é só baixado para o computador; o app não guarda nada.
  const juntarRepasses = async () => {
    try {
      const bytes = await juntarPdfs(arquivos.repasses.flatMap((a) => (a.estado === "ok" ? [a.arquivo] : [])));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      link.download = `Extratos de Repasse - ${new Date().toLocaleDateString("pt-BR").replaceAll("/", "-")}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (e) {
      alert(e instanceof ErroLeitura ? e.message : "Não foi possível juntar os PDFs.");
    }
  };

  const lidos = <T,>(lista: ArquivoLido<T>[]) => lista.flatMap((a) => (a.estado === "ok" ? a.registros : []));
  const todos = [...arquivos.recibos, ...arquivos.repasses];
  const prontos =
    !todos.some((a) => a.estado !== "ok") && lidos(arquivos.recibos).length > 0 && lidos(arquivos.repasses).length > 0;

  const iniciar = () => {
    setBase({ recibos: lidos(arquivos.recibos), repasses: lidos(arquivos.repasses) });
    setRemovidos(new Set());
    // A lista de arquivos é esvaziada; os dados lidos ficam em `base` enquanto o resultado está na tela.
    // No modo "um", os recibos ficam carregados para o próximo extrato.
    setArquivos(modo === "um" ? { recibos: arquivos.recibos, repasses: [] } : VAZIO);
  };

  // Extratos adicionados com o resultado na tela: o extrato com o mesmo número e proprietário é substituído
  // (versão corrigida); os demais continuam.
  const analisarDeNovo = () => {
    const novos = lidos(arquivos.repasses);
    const ids = new Set(novos.map(idRepasse));
    setBase((b) => b && { ...b, repasses: [...b.repasses.filter((r) => !ids.has(idRepasse(r))), ...novos] });
    setRemovidos((s) => new Set([...s].filter((id) => !ids.has(id))));
    setArquivos((s) => ({ ...s, repasses: [] }));
  };
  const extrasProntos = arquivos.repasses.length > 0 && arquivos.repasses.every((a) => a.estado === "ok");

  const pedirLimpeza = () => {
    if (casos && !confirm("Começar uma nova conferência? O resultado atual não poderá ser recuperado.")) return;
    limparTudo();
  };

  const trocarPagina = (novo: Pagina) => {
    if (novo === pagina) return;
    if ((casos || todos.length) && !confirm("Trocar de página apaga os arquivos e o resultado atuais. Continuar?"))
      return;
    limparTudo();
    setPagina(novo);
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

      <div className="layout">
        <nav className="lateral" aria-label="Páginas">
          {PAGINAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="modo"
              aria-current={pagina === p.id ? "page" : undefined}
              onClick={() => trocarPagina(p.id)}
            >
              <strong>{p.nome}</strong>
              <span>{p.descricao}</span>
            </button>
          ))}
        </nav>
        <main className="conteudo">
          {erroSessao ? (
            <p className="erro" role="alert">
              {erroSessao}
            </p>
          ) : (
            <>
              {pagina === "juntar" ? (
                <>
                  <h1>Juntar PDF</h1>
                  <p className="subtitulo">
                    Junte vários Extratos de Repasse em um PDF só e salve no seu computador. Depois, use esse PDF em
                    “Repasses juntados”. Nada é enviado nem salvo pelo app.
                  </p>
                  <div className="seletores">
                    <SeletorPdf
                      rotulo={LADOS.repasses.rotulo}
                      plural={LADOS.repasses.plural}
                      arquivos={arquivos.repasses}
                      desabilitado={false}
                      aoSelecionar={(f) => adicionar("repasses", f)}
                      aoRemover={(id) => remover("repasses", id)}
                    />
                  </div>
                  <div className="acoes">
                    <button
                      type="button"
                      className="botao"
                      disabled={arquivos.repasses.length < 2 || arquivos.repasses.some((a) => a.estado !== "ok")}
                      onClick={juntarRepasses}
                    >
                      Juntar e salvar PDF
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h1>{modo === "um" ? "Repasses únicos" : "Repasses juntados"}</h1>
                  <p className="subtitulo">
                    Recibos do Locatário × Extratos de Repasse exportados do NIDO. Os PDFs são lidos e conferidos no seu
                    computador: nada é enviado nem salvo.
                  </p>

                  {modo === "um" && (
                    <p className="alerta">
                      Neste modo, repasse em dobro só é detectado entre os extratos da mesma conferência: o app não
                      guarda as conferências anteriores.
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
                        <button type="button" className="botao" onClick={() => setBase(null)}>
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

                  {casos && (
                    <section className="adicionar nao-imprimir" aria-label="Adicionar extratos">
                      <SeletorPdf
                        rotulo="Adicionar ou trocar extratos"
                        plural={LADOS.repasses.plural}
                        arquivos={arquivos.repasses}
                        desabilitado={false}
                        aoSelecionar={(f) => adicionar("repasses", f)}
                        aoRemover={(id) => remover("repasses", id)}
                      />
                      <p className="caso__meta">
                        Os extratos já analisados continuam. Um extrato com o mesmo número e proprietário substitui o
                        anterior (use para colocar a versão corrigida).
                      </p>
                      <button type="button" className="botao" disabled={!extrasProntos} onClick={analisarDeNovo}>
                        Analisar de novo
                      </button>
                    </section>
                  )}

                  {casos && (
                    <Resultado
                      casos={casos}
                      modo={modo}
                      removidos={removidos.size}
                      aoRemoverRepasse={(id) => setRemovidos((s) => new Set(s).add(id))}
                      aoRestaurar={() => setRemovidos(new Set())}
                    />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
