import { useEffect, useMemo, useRef, useState } from "react";
import { apagarRepresados, buscarUsuario, type Represados, ErroApi, guardarRepresados, listarRepresados, sair } from "./api";
import type { Represado } from "../shared/contrato";
import { lerPdf, ErroLeitura } from "./pdf/extrair";
import { juntarPdfs } from "./pdf/juntar";
import { extratosNaoLidos, lerRecibos, lerRepasses, type Recibo, type Repasse } from "./nido/ler";
import { caixaDoExtrato, conferirSem, idRepasse, jaPagosAntes, nomeSimples, reais, separarRepresados } from "./nido/conferir";
import { AvisoAtualizacao } from "./components/AvisoAtualizacao";
import { SeletorPdf, type ArquivoLido } from "./components/SeletorPdf";
import { Resultado } from "./components/Resultado";
import { Login } from "./components/Login";

type Lado = "recibos" | "repasses" | "anteriores";
/** geral: todos os extratos de uma vez. um: um extrato por vez, mantendo os recibos carregados. */
export type Modo = "geral" | "um";
type Pagina = Modo | "juntar" | "represados";
const PAGINAS: { id: Pagina; nome: string; descricao: string }[] = [
  { id: "juntar", nome: "Juntar PDF", descricao: "Vários extratos de repasse em um PDF só" },
  { id: "um", nome: "Repasses únicos", descricao: "Recibos ficam carregados; confira um ou vários extratos por vez" },
  { id: "geral", nome: "Repasses juntados", descricao: "Todos os recibos × todos os extratos (ou o PDF juntado)" },
  { id: "represados", nome: "Represados", descricao: "Repasses segurados a pedido do proprietário: confira e conclua" },
];
type Arquivos = { recibos: ArquivoLido<Recibo>[]; repasses: ArquivoLido<Repasse>[]; anteriores: ArquivoLido<Repasse>[] };
const VAZIO: Arquivos = { recibos: [], repasses: [], anteriores: [] };

const LADOS = {
  recibos: { rotulo: "Recibos do Locatário", plural: "recibos", titulo: "Recibo do Locatário", ler: lerRecibos },
  repasses: { rotulo: "Extratos de Repasse", plural: "extratos", titulo: "Extrato de Repasse", ler: lerRepasses },
  // Extratos de lotes já pagos: só para achar repasse que voltou num lote novo (não entram na conferência).
  anteriores: { rotulo: "Lotes anteriores já pagos (opcional)", plural: "extratos", titulo: "Extrato de Repasse", ler: lerRepasses },
} as const;

export function App() {
  const [usuario, setUsuario] = useState<string | null>(null);
  const [desenvolvimento, setDesenvolvimento] = useState(false);
  const [avisoSair, setAvisoSair] = useState(false);
  const [erroSessao, setErroSessao] = useState<string | null>(null);
  const [naoLogado, setNaoLogado] = useState(false);
  const [arquivos, setArquivos] = useState<Arquivos>(VAZIO);
  // Dados lidos da conferência em tela (só em memória): permitem remover ou adicionar extratos e analisar de novo.
  const [base, setBase] = useState<{ recibos: Recibo[]; repasses: Repasse[]; anteriores: Repasse[] } | null>(null);
  const [removidos, setRemovidos] = useState<Set<string>>(new Set());
  // Já pagos em lote anterior saem da soma sozinhos; `liberados` são os que a pessoa confirmou que ainda deve pagar.
  const [liberados, setLiberados] = useState<Set<string>>(new Set());
  const jaPagos = useMemo(() => (base ? jaPagosAntes(base.repasses, base.anteriores) : []), [base]);
  const casos = useMemo(
    () => base && conferirSem(base.recibos, base.repasses, new Set([...removidos, ...jaPagos.map((j) => j.id).filter((id) => !liberados.has(id))])),
    [base, removidos, jaPagos, liberados],
  );
  const [pagina, setPagina] = useState<Pagina>("geral");
  const modo: Modo = pagina === "um" ? "um" : "geral";
  // Represados guardados no banco (todas as usuárias veem os mesmos); `usados` são os ids da conferência em tela.
  const [represados, setRepresados] = useState<Represados | null>(null);
  // Conferência dos represados: uma caixa por vez (chave = grupo dos partilhados, ou o nome sem acento/maiúscula).
  const [selecionado, setSelecionado] = useState<string | null>(null);
  // Caixa aberta na página Represados (null = os cartões de todos os proprietários).
  const [aberto, setAberto] = useState<string | null>(null);
  const [usados, setUsados] = useState<number[]>([]);
  const [avisoRepresados, setAvisoRepresados] = useState("");
  // Proprietários represados que a conferência do dia separou e guardou no banco.
  const [separados, setSeparados] = useState<Repasse[]>([]);
  const recarregarRepresados = () =>
    listarRepresados().then(setRepresados, (e: Error) => setAvisoRepresados(e.message));
  useEffect(() => {
    if (pagina === "represados" && usuario) recarregarRepresados();
  }, [pagina, usuario]);
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
    setLiberados(new Set());
    setSelecionado(null);
    setUsados([]);
    setSeparados([]);
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
        // Dupla checagem: um extrato que fica sem ler some da soma em silêncio, então o arquivo inteiro é recusado.
        const faltam = lado === "recibos" ? "" : extratosNaoLidos(doc.paginas, registros as Repasse[]);
        if (faltam)
          throw new ErroLeitura(
            `A contagem do PDF não bateu com a leitura: ${faltam}. A soma ficaria errada, por isso o arquivo foi recusado. Exporte de novo do NIDO ou mande cada extrato em um PDF.`,
          );
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
  const todos = [...arquivos.recibos, ...arquivos.repasses, ...arquivos.anteriores];
  const prontos =
    !todos.some((a) => a.estado !== "ok") && lidos(arquivos.recibos).length > 0 && lidos(arquivos.repasses).length > 0;

  const [separando, setSeparando] = useState(false);
  /**
   * Tira da conferência os extratos dos proprietários represados (e os recibos só deles) e guarda no banco.
   * Se o banco falhar, devolve null e a conferência não começa: um represado não pode cair no pagamento do dia.
   */
  const separar = async (recibos: Recibo[], repasses: Repasse[]) => {
    setSeparando(true);
    try {
      const { itens, nomes } = await listarRepresados();
      const s = separarRepresados(recibos, repasses, nomes, itens.map((i) => i.dados));
      if (s.guardar.recibos.length + s.guardar.repasses.length) await guardarRepresados(s.guardar);
      // Um por extrato (número + proprietário): "Analisar de novo" com o mesmo extrato não repete a linha.
      setSeparados((antes) => [...new Map([...antes, ...s.separados].map((r) => [idRepasse(r), r])).values()]);
      return s.ficam;
    } catch (e) {
      alert(`Não foi possível separar os represados, por isso a conferência não começou. ${(e as Error).message}`);
      return null;
    } finally {
      setSeparando(false);
    }
  };

  const iniciar = async () => {
    const ficam = await separar(lidos(arquivos.recibos), lidos(arquivos.repasses));
    if (!ficam) return;
    setBase({ ...ficam, anteriores: lidos(arquivos.anteriores) });
    setRemovidos(new Set());
    setLiberados(new Set());
    // A lista de arquivos é esvaziada; os dados lidos ficam em `base` enquanto o resultado está na tela.
    // No modo "um", os recibos ficam carregados para o próximo extrato.
    setArquivos(modo === "um" ? { ...arquivos, repasses: [] } : VAZIO);
  };

  // Extratos adicionados com o resultado na tela: o extrato com o mesmo número e proprietário é substituído
  // (versão corrigida); os demais continuam.
  const analisarDeNovo = async () => {
    const ficam = await separar([], lidos(arquivos.repasses));
    if (!ficam) return;
    const novos = ficam.repasses;
    const ids = new Set(novos.map(idRepasse));
    setBase((b) => b && { ...b, repasses: [...b.repasses.filter((r) => !ids.has(idRepasse(r))), ...novos] });
    setRemovidos((s) => new Set([...s].filter((id) => !ids.has(id))));
    setArquivos((s) => ({ ...s, repasses: [] }));
  };
  const extrasProntos = arquivos.repasses.length > 0 && arquivos.repasses.every((a) => a.estado === "ok");

  // Uma caixa por proprietário, ou por grupo dos partilhados: os nomes da lista e quem ainda tem dados guardados
  // (mesmo se saiu da lista).
  const grupos = (() => {
    const itens = represados?.itens ?? [];
    const recibos = itens.flatMap((r) => (r.tipo === "recibo" ? [r] : []));
    // `grupo` pode ter vários, separados por vírgula: o nome entra em cada uma dessas caixas.
    const chavesDoNome = new Map<string, string[]>();
    for (const nome of represados?.nomes ?? []) {
      const gs = (represados?.grupos[nome] ?? "").split(",").map((g) => nomeSimples(g)).filter(Boolean);
      chavesDoNome.set(nomeSimples(nome), gs.length ? gs.map((g) => `grupo:${g}`) : [nomeSimples(nome)]);
    }
    const chaves = (proprietario: string) => chavesDoNome.get(nomeSimples(proprietario)) ?? [nomeSimples(proprietario)];
    const porChave = new Map<string, { nomes: string[]; repasses: Extract<Represado, { tipo: "repasse" }>[] }>();
    const caixa = (chave: string) => porChave.get(chave) ?? porChave.set(chave, { nomes: [], repasses: [] }).get(chave)!;
    for (const nome of represados?.nomes ?? []) for (const k of chaves(nome)) caixa(k).nomes.push(nome);
    const extratos = itens.flatMap((r) => (r.tipo === "repasse" ? [r] : []));
    for (const r of extratos) {
      const simples = nomeSimples(r.dados.proprietario);
      const outros = extratos
        .filter((o) => o.dados.contrato === r.dados.contrato && nomeSimples(o.dados.proprietario) !== simples)
        .map((o) => chaves(o.dados.proprietario));
      const g = caixa(caixaDoExtrato(chaves(r.dados.proprietario), outros, (k) => porChave.get(k)?.nomes.length ?? 0));
      if (!g.nomes.some((n) => nomeSimples(n) === simples)) g.nomes.push(r.dados.proprietario);
      g.repasses.push(r);
    }
    return [...porChave].map(([chave, { nomes, repasses }]) => {
      const g = { nome: nomes.sort((a, b) => a.localeCompare(b, "pt-BR")).join(" + "), repasses };
      const contratos = [...new Set(g.repasses.map((r) => r.dados.contrato))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
      return {
        chave,
        nomes,
        ...g,
        contratos: contratos.map((c) => ({
          contrato: c,
          repasses: g.repasses.filter((r) => r.dados.contrato === c),
          recibos: recibos.filter((r) => r.dados.contrato === c),
        })),
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  })();
  const grupoEmTela = grupos.find((g) => g.chave === selecionado);

  const conferirRepresado = (chave: string) => {
    const g = grupos.find((x) => x.chave === chave);
    if (!g) return;
    const recibos = g.contratos.flatMap((c) => c.recibos);
    setSelecionado(chave);
    setUsados([...g.repasses, ...recibos].map((r) => r.id));
    setBase({ recibos: recibos.map((r) => r.dados), repasses: g.repasses.map((r) => r.dados), anteriores: [] });
    setRemovidos(new Set());
    setLiberados(new Set());
    setAvisoRepresados("");
  };

  const concluirRepresados = async () => {
    if (!confirm(`Concluir a conferência de ${grupoEmTela?.nome} e apagar do banco os ${usados.length} documentos dela? Não dá para desfazer.`)) return;
    try {
      await apagarRepresados(usados);
      limparTudo();
      setAberto(null);
      setAvisoRepresados("Conferência concluída: os dados foram apagados do banco.");
      await recarregarRepresados();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const pedirLimpeza = () => {
    if (casos && !confirm("Começar uma nova conferência? O resultado atual não poderá ser recuperado.")) return;
    limparTudo();
  };

  const trocarPagina = (novo: Pagina) => {
    if (novo === pagina) return;
    if ((casos || todos.length) && !confirm("Trocar de página apaga os arquivos e o resultado atuais. Continuar?"))
      return;
    limparTudo();
    setAberto(null);
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
      <AvisoAtualizacao />
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
                  <h1>
                    {PAGINAS.find((p) => p.id === pagina)?.nome}
                    {pagina === "represados" && casos && grupoEmTela ? `: ${grupoEmTela.nome}` : ""}
                  </h1>
                  {pagina === "represados" ? (
                    <p className="subtitulo">
                      Repasses que o proprietário pediu para segurar. A conferência do dia separa sozinha os extratos
                      destes proprietários e guarda no banco só os dados lidos (o PDF não). Ao concluir a conferência
                      aqui, os dados dela são apagados.
                    </p>
                  ) : (
                    <p className="subtitulo">
                      Recibos do Locatário × Extratos de Repasse exportados do NIDO. Os PDFs são lidos e conferidos no
                      seu computador: nada é enviado nem salvo.
                    </p>
                  )}
                  {pagina === "represados" && avisoRepresados && (
                    <p className="alerta" role="status">
                      {avisoRepresados}
                    </p>
                  )}

                  {modo === "um" && (
                    <p className="alerta">
                      Neste modo, repasse em dobro só é detectado entre os extratos da mesma conferência: o app não
                      guarda as conferências anteriores.
                    </p>
                  )}

                  {!casos && pagina === "represados" && (
                    <section aria-label="Conferir represados">
                      {!represados ? (
                        !avisoRepresados && <p role="status">Carregando…</p>
                      ) : !grupos.length ? (
                        <p className="caso__meta">Nenhum proprietário represado cadastrado (tabela represados_nomes no Supabase).</p>
                      ) : (
                        (() => {
                          const resumo = (g: (typeof grupos)[number]) =>
                            g.repasses.length
                              ? `${g.contratos.length} contrato(s) · ${g.repasses.length} extrato(s) · ${reais(g.repasses.reduce((n, r) => n + r.dados.pago, 0))}`
                              : "Nada guardado";
                          const g = grupos.find((x) => x.chave === aberto);
                          if (!g)
                            return (
                              <div className="cartoes">
                                {grupos.map((x) => (
                                  <button key={x.chave} type="button" className="cartao" onClick={() => setAberto(x.chave)}>
                                    <strong className="cartao__nome">{x.nome}</strong>
                                    <span className="caso__meta">{resumo(x)}</span>
                                  </button>
                                ))}
                              </div>
                            );
                          return (
                            <>
                              <button type="button" className="botao botao--texto" onClick={() => setAberto(null)}>
                                ← Voltar para os proprietários
                              </button>
                              <h2>{g.nome}</h2>
                              <p className="caso__meta">{resumo(g)}</p>
                              {g.contratos.map((c) => (
                                <div key={c.contrato} className="caso">
                                  <h3>Contrato {c.contrato}</h3>
                                  <ul className="seletor__lista">
                                    {c.repasses.map((r) => (
                                      <li key={r.id}>
                                        {g.nome.includes(" + ") && `${r.dados.proprietario} · `}Extrato nº {r.dados.numero} · competência {r.dados.competencia} · venc. {r.dados.vencimento} ·{" "}
                                        <strong>{reais(r.dados.pago)}</strong>
                                      </li>
                                    ))}
                                    {c.recibos.map((r) => (
                                      <li key={r.id}>
                                        Recibo · venc. {r.dados.vencimento} · inquilino {r.dados.locatario} · pago {reais(r.dados.pago)}
                                      </li>
                                    ))}
                                    {!c.recibos.length && <li className="caso__meta">Sem recibo guardado para este contrato.</li>}
                                  </ul>
                                </div>
                              ))}
                              {g.repasses.length > 0 && (
                                <div className="acoes">
                                  <button type="button" className="botao" onClick={() => conferirRepresado(g.chave)}>
                                    Conferir {g.nome}
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        })()
                      )}
                    </section>
                  )}

                  {!casos && pagina !== "represados" && (
                    <div className="seletores">
                      {(["recibos", "repasses", "anteriores"] as const).map((lado) => (
                        <SeletorPdf
                          key={lado}
                          rotulo={LADOS[lado].rotulo}
                          plural={LADOS[lado].plural}
                          arquivos={arquivos[lado]}
                          aoSelecionar={(f) => adicionar(lado, f)}
                          aoRemover={(id) => remover(lado, id)}
                        />
                      ))}
                    </div>
                  )}

                  <div className="acoes">
                    {!casos && pagina === "represados" ? null : !casos ? (
                      <button type="button" className="botao" disabled={!prontos || separando} onClick={iniciar}>
                        {separando ? "Separando represados…" : "Conferir"}
                      </button>
                    ) : pagina === "represados" ? (
                      <>
                        <button type="button" className="botao" onClick={concluirRepresados}>
                          Concluir e apagar do banco
                        </button>
                        <button type="button" className="botao botao--secundario" onClick={limparTudo}>
                          Voltar sem concluir
                        </button>
                      </>
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

                  {casos && pagina !== "represados" && separados.length > 0 && (
                    <p className="alerta nao-imprimir" role="status">
                      Represados guardados no banco e fora desta conferência:{" "}
                      {[...new Set(separados.map((r) => r.proprietario))].join(", ")}. Confira e conclua na página “Represados”.
                    </p>
                  )}

                  {casos && pagina !== "represados" && (
                    <section className="adicionar nao-imprimir" aria-label="Adicionar extratos">
                      <SeletorPdf
                        rotulo="Adicionar ou trocar extratos"
                        plural={LADOS.repasses.plural}
                        arquivos={arquivos.repasses}
                        aoSelecionar={(f) => adicionar("repasses", f)}
                        aoRemover={(id) => remover("repasses", id)}
                      />
                      <p className="caso__meta">
                        Os extratos já analisados continuam. Um extrato com o mesmo número e proprietário substitui o
                        anterior (use para colocar a versão corrigida).
                      </p>
                      <button type="button" className="botao" disabled={!extrasProntos || separando} onClick={analisarDeNovo}>
                        Analisar de novo
                      </button>
                    </section>
                  )}

                  {casos && (
                    <Resultado
                      casos={casos}
                      modo={modo}
                      represados={pagina === "represados" ? [] : separados}
                      donos={pagina === "represados" && grupoEmTela ? grupoEmTela.nomes : []}
                      removidos={removidos.size}
                      jaPagos={jaPagos.map((j) => ({ ...j, liberado: liberados.has(j.id) }))}
                      aoLiberar={(id, sim) => setLiberados((s) => { const n = new Set(s); if (sim) n.add(id); else n.delete(id); return n; })}
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
