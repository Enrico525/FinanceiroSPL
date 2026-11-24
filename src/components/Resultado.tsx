import { useState } from "react";
import { flushSync } from "react-dom";
import { CONTA_BRADESCO, CONTA_ITAU, chaveRepasse, contaDeSaida, contaDoRepasse, reais, totais, type Caso, type Conta, type JaPago, type Manual } from "../nido/conferir";
import { valorDigitado } from "../nido/ler";
import type { Modo } from "../App";
import { normalizarNome } from "../../shared/credenciais";

// O NIDO às vezes traz a Descrição só com "***" (cadastro sem observação): sem letra nem número, não conta.
const descricaoUtil = (d: string) => (/[\p{L}\d]/u.test(d) ? d : "");

const ROTULO = { divergencia: "Divergência", manual: "Conferir", aviso: "Aviso" } as const;
const PESO = { divergencia: 0, manual: 1, aviso: 2 } as const;
// Caso que tinha divergência ou ia para conferência manual e a pessoa marcou como certo (só nesta tela).
type Visto = Caso & { aceito?: boolean };
const ACEITO = "Aceito na conferência manual";

// Textos vêm do PDF: renderizados só como texto pelo React (sem HTML).
function CartaoCaso({
  c,
  aoAceitar,
  aoRemoverRepasse,
}: {
  c: Visto;
  aoAceitar: (aceito: boolean) => void;
  aoRemoverRepasse: (id: string) => void;
}) {
  const meta = [
    `venc. ${c.vencimento}`,
    c.situacao,
    c.inquilino && `Inquilino: ${c.inquilino}`,
  ].filter(Boolean);
  return (
    <li className="caso">
      <p className="caso__titulo">
        <strong>Contrato {c.contrato}</strong>
        {c.proprietarios.length > 0 && (
          <>
            {" · Proprietário: "}
            <strong>{c.proprietarios.join(", ")}</strong>
          </>
        )}
        {c.aceito && (
          <>
            {" "}
            <span className="selo selo--aceito">{ACEITO}</span>
          </>
        )}
      </p>
      <p className="caso__meta">{meta.join(" · ")}</p>
      <ul className="caso__onde" aria-label="Arquivos lidos">
        {c.onde.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
      {c.apontamentos.length > 0 && (
        <ul>
          {[...c.apontamentos]
            .sort((a, b) => PESO[a.tipo] - PESO[b.tipo])
            .map((a, i) => (
              <li key={i}>
                <span className={`selo selo--${a.tipo}`}>{ROTULO[a.tipo]}</span> {a.texto}
              </li>
            ))}
        </ul>
      )}
      {(c.aceito || c.status === "divergencia" || c.status === "manual") && (
        <button type="button" className="botao botao--texto" onClick={() => aoAceitar(!c.aceito)}>
          {c.aceito ? "Desfazer (voltar para a lista anterior)" : "Conferi manualmente: marcar como certo"}
        </button>
      )}
      {c.repasses.map((r) => (
        <button key={r.id} type="button" className="botao botao--texto caso__remover" onClick={() => aoRemoverRepasse(r.id)}>
          Remover extrato de {r.proprietario} desta análise
        </button>
      ))}
    </li>
  );
}

const SECOES: { status: Caso["status"]; titulo: string; nota?: string; aberta?: boolean }[] = [
  { status: "divergencia", titulo: "Com divergência", aberta: true },
  { status: "manual", titulo: "Conferir manualmente", aberta: true },
  {
    status: "sem_extrato",
    titulo: "Recibo sem extrato",
    nota: "O recibo foi pago, mas o repasse não está nos extratos enviados. Confira no NIDO se foi repassado em outro extrato.",
  },
  { status: "sem_recibo", titulo: "Extrato sem recibo", nota: "Normalmente é recibo de outro dia ou banco que não foi enviado." },
  { status: "ok", titulo: "Sem divergência" },
];

// Relatório de repasses (para pagar): totais e uma tabela por conta de saída. Não é guardado;
// para manter uma cópia, a pessoa imprime ou salva em PDF pelo navegador.
type PropsRelatorio = {
  casos: Visto[];
  secoes: typeof SECOES;
  escolhas: Record<string, Conta>;
  aoEscolher: (chave: string, conta: Conta) => void;
  aoFechar: () => void;
  removidos: number;
  aoRemoverRepasse: (id: string) => void;
  aoRestaurar: () => void;
  manuais: Manual[];
  aoMudarManuais: (m: Manual[]) => void;
};

const NOME_CONTA = { [CONTA_ITAU]: "Itaú", [CONTA_BRADESCO]: "Bradesco" } as const;

function Relatorio({ casos, secoes, escolhas, aoEscolher, aoFechar, removidos, aoRemoverRepasse, aoRestaurar, manuais, aoMudarManuais }: PropsRelatorio) {
  const titulo = Object.fromEntries(SECOES.map((s) => [s.status, s.titulo]));
  // Relatório separado por conta de saída: com "Bradesco" ou "Itaú" escolhido, tudo (totais, lançamentos manuais,
  // contratos e impressão) mostra só os repasses daquela conta. Sem banco e sem conta escolhida: só em "Todos".
  const [filtro, setFiltro] = useState<Conta | "">("");
  const todos = secoes.flatMap((s) => casos.filter((c) => c.status === s.status));
  const lista = filtro
    ? todos
        .map((c) => ({
          ...c,
          repasses: c.repasses.filter((r) => contaDoRepasse(c.contrato, r, escolhas) === filtro),
        }))
        .filter((c) => c.repasses.length)
    : todos;
  const manuaisDaqui = manuais.filter((m) => !filtro || m.conta === filtro);
  const t = totais(lista, escolhas, manuaisDaqui);
  // Lançamento manual: repasse feito por fora do NIDO (sem extrato). Só soma; não há o que conferir.
  const [valorManual, setValorManual] = useState("");
  const [contaManual, setContaManual] = useState<Conta>(CONTA_ITAU);
  const [erroManual, setErroManual] = useState(false);
  const adicionarManual = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = valorDigitado(valorManual);
    setErroManual(!valor);
    if (!valor) return;
    aoMudarManuais([...manuais, { conta: filtro || contaManual, valor }]);
    setValorManual("");
  };
  const faltam = t.semBanco.filter((r) => !r.conta).length;
  const pagamentos = lista
    .flatMap((c) => c.repasses.map((r) => ({ c, r, conta: contaDoRepasse(c.contrato, r, escolhas) })))
    .filter(({ r }) => r.valor - r.caucao !== 0) // extrato só de caução não é pago; aparece no total à parte
    .sort((a, b) => Number(a.c.contrato) - Number(b.c.contrato));
  // Pesquisa da lista de excluir: só os dígitos contam, então "1.234,56" e "123456" acham o mesmo valor.
  const [buscaContrato, setBuscaContrato] = useState("");
  const [buscaValor, setBuscaValor] = useState("");
  const digitos = (s: string) => s.replace(/\D/g, "");
  // Pesquisa das tabelas de pagamento: só esconde na tela; o que não bate continua na impressão.
  const [buscaPagamento, setBuscaPagamento] = useState("");
  // Com letras, procura no nome do proprietário (sem acento/maiúscula); só números, no contrato.
  const bate = (busca: string, contrato: string, proprietario: string) =>
    /\p{L}/u.test(busca) ? normalizarNome(proprietario).includes(normalizarNome(busca)) : contrato.includes(digitos(busca));
  const [buscaValorPagamento, setBuscaValorPagamento] = useState("");
  const pagamentoAchado = (contrato: string, proprietario: string, valor: number) =>
    bate(buscaPagamento, contrato, proprietario) && digitos(reais(valor)).includes(digitos(buscaValorPagamento));
  const achados = lista.flatMap((c) =>
    c.repasses.filter((r) => bate(buscaContrato, c.contrato, r.proprietario) && digitos(reais(r.valor)).includes(digitos(buscaValor))).map((r) => ({ c, r })),
  );
  return (
    <div className="relatorio">
      <div className="acoes nao-imprimir">
        <button type="button" className="botao" onClick={() => window.print()}>
          Imprimir / salvar em PDF
        </button>
        {([CONTA_ITAU, CONTA_BRADESCO] as const).map((conta) => (
          <button
            key={conta}
            type="button"
            className="botao"
            onClick={() => {
              // A tela precisa já estar só com a conta antes de o navegador abrir a impressão.
              flushSync(() => setFiltro(conta));
              window.print();
            }}
          >
            Salvar só do {NOME_CONTA[conta]}
          </button>
        ))}
        <button type="button" className="botao botao--secundario" onClick={aoFechar}>
          Voltar ao resultado
        </button>
      </div>
      <div className="acoes filtro nao-imprimir" role="group" aria-label="Escolher o relatório por conta de saída">
        <span>Relatório:</span>
        {(["", CONTA_BRADESCO, CONTA_ITAU] as const).map((conta) => (
          <button
            key={conta}
            type="button"
            className={`botao botao--pequeno ${filtro === conta ? "" : "botao--secundario"}`}
            aria-pressed={filtro === conta}
            onClick={() => setFiltro(conta)}
          >
            {conta ? `Só ${NOME_CONTA[conta]}` : "Todos"}
          </button>
        ))}
      </div>
      <h2>Relatório de repasses{filtro && ` — ${NOME_CONTA[filtro]}`}</h2>
      <p className="caso__meta">Gerado em {new Date().toLocaleString("pt-BR")}</p>
      <section className="totais" aria-label="Totais a repassar">
        <p className="totais__geral">
          Total a repassar: <strong>{reais(t.geral)}</strong>
        </p>
        <p className="caso__meta">
          Soma do valor pago/a repassar de {t.repasses} extrato(s) desta conferência
          {manuaisDaqui.length > 0 && ` mais ${manuaisDaqui.length} lançamento(s) manual(is), que somam ${reais(t.manual)}`}.
        </p>
        {t.caucao.extratos > 0 && (
          <p className="caso__meta">
            <strong>Fora do total:</strong> {t.caucao.extratos} depósito(s) caução, que somam {reais(t.caucao.valor)}. Depósito caução não entra na soma.
          </p>
        )}
        {removidos > 0 && (
          <p className="alerta nao-imprimir">
            {removidos} extrato(s) excluído(s) da soma e da análise.{" "}
            <button type="button" className="botao botao--texto" onClick={aoRestaurar}>
              Colocar de volta
            </button>
          </p>
        )}
        <details className="soma-lista nao-imprimir">
          <summary>Ver os {t.repasses} repasses da soma (para excluir algum)</summary>
          <div className="soma-lista__busca">
            <label className="campo">
              Pesquisar por contrato ou proprietário
              <input type="search" value={buscaContrato} onChange={(e) => setBuscaContrato(e.target.value)} placeholder="Ex.: 15215 ou Maria" />
            </label>
            <label className="campo">
              Pesquisar por valor
              <input type="search" inputMode="decimal" value={buscaValor} onChange={(e) => setBuscaValor(e.target.value)} placeholder="Ex.: 1.234,56" />
            </label>
          </div>
          {achados.length === 0 && <p className="caso__meta">Nenhum repasse encontrado.</p>}
          <ul>
            {achados.map(({ c, r }) => (
                <li key={r.id}>
                  <span>
                    <strong>Contrato {c.contrato}</strong> · <strong>{r.proprietario}</strong> · {r.banco || "sem banco"} ·{" "}
                    <strong>{reais(r.valor)}</strong>
                    {r.caucao > 0 && ` (depósito caução de ${reais(r.caucao)}: não soma)`}
                    <span className="caso__meta"> · Extrato: {r.onde}</span>
                  </span>
                  <button type="button" className="botao botao--texto" onClick={() => aoRemoverRepasse(r.id)}>
                    Excluir
                  </button>
                </li>
            ))}
          </ul>
        </details>
        <table className="totais__bancos">
          <thead>
            <tr>
              <th scope="col">Conta de saída</th>
              <th scope="col">Extratos</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {t.bancos.map((b) => (
              <tr key={b.banco} className={b.banco ? undefined : "totais__sem-banco"}>
                <th scope="row">
                  {b.banco === CONTA_ITAU ? "Itaú (todos os bancos, menos Bradesco)" : b.banco || "Sem banco: escolha a conta abaixo"}
                  {b.banco && <span className="caso__meta totais__inclui">Inclui: {b.bancos.join(", ")}</span>}
                </th>
                <td>{b.repasses}</td>
                <td>
                  <strong>{reais(b.valor)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={`sem-banco manuais ${manuaisDaqui.length ? "" : "nao-imprimir"}`}>
          <p className="sem-banco__titulo">
            <strong>Lançamentos manuais (repasses feitos por fora, sem extrato)</strong>
          </p>
          <form className="manuais__form nao-imprimir" onSubmit={adicionarManual}>
            <label className="campo">
              Valor
              <input inputMode="decimal" value={valorManual} onChange={(e) => setValorManual(e.target.value)} placeholder="Ex.: 2.657,61" aria-invalid={erroManual} />
            </label>
            {!filtro && (
              <span className="sem-banco__opcoes" role="radiogroup" aria-label="Conta do lançamento manual">
                {([CONTA_ITAU, CONTA_BRADESCO] as const).map((conta) => (
                  <label key={conta}>
                    <input type="radio" name="conta-manual" checked={contaManual === conta} onChange={() => setContaManual(conta)} /> Somar no {NOME_CONTA[conta]}
                  </label>
                ))}
              </span>
            )}
            <button type="submit" className="botao botao--pequeno">
              Adicionar
            </button>
          </form>
          {erroManual && (
            <p className="alerta" role="alert">
              Digite um valor maior que zero, como 2.657,61.
            </p>
          )}
          <ul>
            {manuais.map((m, i) =>
              filtro && m.conta !== filtro ? null : (
              <li key={i}>
                <span>
                  {NOME_CONTA[m.conta]} · <strong>{reais(m.valor)}</strong>
                </span>
                <button type="button" className="botao botao--texto nao-imprimir" onClick={() => aoMudarManuais(manuais.filter((_, j) => j !== i))}>
                  Remover
                </button>
              </li>
              ),
            )}
          </ul>
        </div>
        {t.semBanco.length > 0 && (
          <div className={`sem-banco ${faltam ? "sem-banco--pendente" : ""}`}>
            <p className="sem-banco__titulo">
              <strong>
                {faltam
                  ? `Atenção: ${faltam} repasse(s) sem banco no extrato. Escolha em qual conta somar.`
                  : "Repasses sem banco no extrato: conta escolhida."}
              </strong>
            </p>
            <ul>
              {t.semBanco.map((r) => (
                <li key={r.chave}>
                  <span>
                    <strong className="sem-banco__contrato">Contrato {r.contrato}</strong> · <strong>{r.proprietario}</strong> · <strong>{reais(r.valor)}</strong>
                    <span className="caso__meta"> · Extrato: {r.onde}</span>
                  </span>
                  <span className="sem-banco__opcoes" role="radiogroup" aria-label={`Conta do repasse do contrato ${r.contrato}`}>
                    {([CONTA_ITAU, CONTA_BRADESCO] as const).map((conta) => (
                      <label key={conta}>
                        <input type="radio" name={r.chave} checked={r.conta === conta} onChange={() => aoEscolher(r.chave, conta)} /> Somar no{" "}
                        {NOME_CONTA[conta]}
                      </label>
                    ))}
                    <button type="button" className="botao botao--pequeno nao-imprimir" onClick={() => aoRemoverRepasse(r.id)}>
                      Remover extrato
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <div className="soma-lista__busca nao-imprimir">
        <label className="campo">
          Pesquisar contrato ou proprietário nas tabelas abaixo
          <input type="search" value={buscaPagamento} onChange={(e) => setBuscaPagamento(e.target.value)} placeholder="Ex.: 15215 ou Maria" />
        </label>
        <label className="campo">
          Pesquisar por valor
          <input
            type="search"
            inputMode="decimal"
            value={buscaValorPagamento}
            onChange={(e) => setBuscaValorPagamento(e.target.value)}
            placeholder="Ex.: 1.234,56"
          />
        </label>
      </div>
      {!pagamentos.some(({ c, r }) => pagamentoAchado(c.contrato, r.proprietario, r.valor - r.caucao)) &&<p className="caso__meta nao-imprimir">Nenhum contrato encontrado.</p>}
      {/* Pagamentos: um quadro por conta de saída, só com o necessário para pagar (a conferência fica na tela de resultado). */}
      {([CONTA_ITAU, CONTA_BRADESCO, ""] as const).map((conta) => {
        const linhas = pagamentos.filter((p) => p.conta === conta);
        if (!linhas.length) return null;
        return (
          <section key={conta || "sem"} className="pagamentos">
            <h3>
              {conta ? `Sai do ${NOME_CONTA[conta]}` : "Sem banco no extrato: escolha a conta acima"} · {linhas.length} repasse(s) ·{" "}
              {reais(linhas.reduce((n, { r }) => n + r.valor - r.caucao, 0))}
            </h3>
            <table className="pagamentos__tabela">
              <thead>
                <tr>
                  <th scope="col">Contrato</th>
                  <th scope="col">Proprietário</th>
                  <th scope="col">Dados bancários</th>
                  <th scope="col">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ c, r, conta: atual }) => {
                  const titular = descricaoUtil(r.pagamento.descricao);
                  return (
                    <tr key={r.id} className={pagamentoAchado(c.contrato, r.proprietario, r.valor - r.caucao) ?undefined : "oculto-na-tela"}>
                      <td>
                        <strong className="pagamentos__destaque">{c.contrato}</strong>
                        <span className="caso__meta">{c.competencia && `comp. ${c.competencia}`}</span>
                        {c.status !== "ok" && !c.aceito && <span className={`selo selo--${c.status === "divergencia" ? "divergencia" : "manual"}`}>{titulo[c.status]}</span>}
                      </td>
                      <td>
                        {/* Na impressão, o titular da conta (Descrição do extrato) vem em destaque; sem Descrição, o titular é o proprietário. */}
                        {titular && <strong className="pagamentos__destaque so-impressao">{titular}</strong>}
                        <strong className={`pagamentos__destaque ${titular ? "pagamentos__secundario" : ""}`}>{r.proprietario}</strong>
                        {r.pagamento.documento && <span className="caso__meta">{r.pagamento.documento}</span>}
                      </td>
                      <td>
                        {r.banco ? (
                          <>
                            <strong className="pagamentos__destaque">{r.banco}</strong>
                            <strong className="pagamentos__conta">
                              {[r.pagamento.agencia && `Ag. ${r.pagamento.agencia}`, r.pagamento.conta && `Conta ${r.pagamento.conta}`, r.pagamento.tipoConta]
                                .filter(Boolean)
                                .join(" · ")}
                            </strong>
                            {(r.pagamento.forma || titular) && (
                              <span className="caso__meta">{[r.pagamento.forma, titular].filter(Boolean).join(" · ")}</span>
                            )}
                            {atual !== contaDeSaida(r.banco) && <span className="selo selo--manual">Conta trocada à mão</span>}
                            {atual && (
                              <button
                                type="button"
                                className="botao botao--texto nao-imprimir"
                                onClick={() => aoEscolher(chaveRepasse(c.contrato, r.proprietario), atual === CONTA_ITAU ? CONTA_BRADESCO : CONTA_ITAU)}
                              >
                                Pagar pelo {NOME_CONTA[atual === CONTA_ITAU ? CONTA_BRADESCO : CONTA_ITAU]}
                              </button>
                            )}
                          </>
                        ) : (
                          "sem dados bancários no extrato"
                        )}
                      </td>
                      <td className="pagamentos__valor">
                        <strong>{reais(r.valor - r.caucao)}</strong>
                        {r.caucao > 0 && <span className="caso__meta">+ caução {reais(r.caucao)} (fora do total)</span>}
                        <button type="button" className="botao botao--texto nao-imprimir" onClick={() => aoRemoverRepasse(r.id)}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

// Topo em vermelho, na tela e na impressão: o que não deveria entrar na soma como está.
function Barrados({ casos, jaPagos, aoLiberar }: { casos: Caso[]; jaPagos: (JaPago & { liberado: boolean })[]; aoLiberar: (id: string, sim: boolean) => void }) {
  // Valor do extrato diferente da soma das suas linhas: o total do NIDO ou a leitura está errada.
  const errados = casos.flatMap((c) => c.repasses.filter((r) => r.valor !== r.liquido).map((r) => ({ c, r })));
  if (!jaPagos.length && !errados.length) return null;
  return (
    <section className="barrados" role="alert">
      {jaPagos.length > 0 && (
        <>
          <h2>Já pagos em lote anterior: {jaPagos.filter((j) => !j.liberado).length} fora da soma</h2>
          <p>Estes extratos já vieram num lote anterior. Provavelmente o lote ficou aberto no NIDO e eles foram baixados de novo.</p>
          <ul>
            {jaPagos.map((j) => (
              <li key={j.id}>
                <span>
                  <strong className="barrados__contrato">Contrato {j.contrato}</strong> · {j.proprietario} · extrato nº {j.numero} ·{" "}
                  <strong>{reais(j.valor)}</strong>
                  {j.valorAntes !== j.valor && ` (no lote anterior: ${reais(j.valorAntes)})`}
                  <span className="caso__meta"> · Agora: {j.onde} · Antes: {j.ondeAntes}</span>
                </span>
                <strong>{j.liberado ? "ENTRA NA SOMA (liberado à mão)" : "FORA DA SOMA"}</strong>
                <button type="button" className="botao botao--pequeno nao-imprimir" onClick={() => aoLiberar(j.id, !j.liberado)}>
                  {j.liberado ? "Tirar da soma de novo" : "Não foi pago: colocar na soma"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {errados.length > 0 && (
        <>
          <h2>Valor do extrato diferente da soma das linhas: {errados.length}</h2>
          <p>Estão na soma com o valor do NIDO, mas a conta das linhas dá outro valor. Confira no PDF antes de pagar.</p>
          <ul>
            {errados.map(({ c, r }) => (
              <li key={r.id}>
                <span>
                  <strong className="barrados__contrato">Contrato {c.contrato}</strong> · {r.proprietario} · NIDO: <strong>{reais(r.valor)}</strong> · linhas:{" "}
                  <strong>{reais(r.liquido)}</strong>
                  <span className="caso__meta"> · {r.onde}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

type PropsResultado = {
  casos: Caso[];
  modo: Modo;
  jaPagos: (JaPago & { liberado: boolean })[];
  aoLiberar: (id: string, sim: boolean) => void;
  removidos: number;
  aoRemoverRepasse: (id: string) => void;
  aoRestaurar: () => void;
};

export function Resultado({ casos: originais, modo, jaPagos, aoLiberar, removidos, aoRemoverRepasse, aoRestaurar }: PropsResultado) {
  const [relatorio, setRelatorio] = useState(false);
  // Some ao começar outra conferência: nada é guardado.
  const [aceitos, setAceitos] = useState<Set<string>>(new Set());
  const [escolhas, setEscolhas] = useState<Record<string, Conta>>({});
  const [manuais, setManuais] = useState<Manual[]>([]);
  const id = (c: Caso) => `${c.contrato}|${c.vencimento}`;
  const casos: Visto[] = originais.map((c) => (aceitos.has(id(c)) ? { ...c, status: "ok", aceito: true } : c));
  const aceitar = (c: Caso, sim: boolean) =>
    setAceitos((atual) => {
      const novo = new Set(atual);
      if (sim) novo.add(id(c));
      else novo.delete(id(c));
      return novo;
    });
  // Um extrato por vez: os demais recibos ficam sem extrato por definição, então essa seção não interessa.
  const secoes = modo === "um" ? SECOES.filter((s) => s.status !== "sem_extrato") : SECOES;
  const de = (s: Caso["status"]) => casos.filter((c) => c.status === s);

  const barrados = <Barrados casos={originais} jaPagos={jaPagos} aoLiberar={aoLiberar} />;
  if (relatorio)
    return (
      <>
      {barrados}
      <Relatorio
        casos={casos}
        secoes={secoes}
        escolhas={escolhas}
        aoEscolher={(chave, conta) => setEscolhas((e) => ({ ...e, [chave]: conta }))}
        aoFechar={() => setRelatorio(false)}
        removidos={removidos}
        aoRemoverRepasse={aoRemoverRepasse}
        aoRestaurar={aoRestaurar}
        manuais={manuais}
        aoMudarManuais={setManuais}
      />
      </>
    );

  return (
    <div className="resultado">
      {barrados}
      <button type="button" className="botao botao--secundario botao--relatorio" onClick={() => setRelatorio(true)}>
        Ver relatório de repasses
      </button>
      {removidos > 0 && (
        <p className="alerta">
          {removidos} extrato(s) removido(s) desta análise.{" "}
          <button type="button" className="botao botao--texto" onClick={aoRestaurar}>
            Colocar de volta
          </button>
        </p>
      )}
      <ul className="placar" role="status">
        {secoes.map((s) => (
          <li key={s.status} className={`placar__item placar__item--${s.status}`}>
            <strong>{de(s.status).length}</strong> {s.titulo.toLowerCase()}
          </li>
        ))}
      </ul>

      {secoes.map((s) => {
        const lista = de(s.status);
        if (!lista.length) return null;
        return (
          <section key={s.status}>
            <details open={s.aberta}>
              <summary>
                <h2>
                  {s.titulo} ({lista.length})
                </h2>
              </summary>
              {s.nota && <p className="nota">{s.nota}</p>}
              <ul className="casos">
                {lista.map((c) => (
                  <CartaoCaso key={id(c)} c={c} aoAceitar={(sim) => aceitar(c, sim)} aoRemoverRepasse={aoRemoverRepasse} />
                ))}
              </ul>
            </details>
          </section>
        );
      })}
    </div>
  );
}
