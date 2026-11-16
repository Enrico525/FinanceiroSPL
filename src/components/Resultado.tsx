import { useState } from "react";
import { CONTA_BRADESCO, CONTA_ITAU, chaveRepasse, contaDeSaida, reais, totais, type Caso, type Conta, type Manual } from "../nido/conferir";
import { valorDigitado } from "../nido/ler";
import type { Modo } from "../App";

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

// Relatório completo da conferência atual: tudo o que bateu e tudo o que foi apontado. Não é guardado;
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
          repasses: c.repasses.filter((r) => (r.banco ? contaDeSaida(r.banco) : escolhas[chaveRepasse(c.contrato, r.proprietario)]) === filtro),
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
  // Pesquisa da lista de excluir: só os dígitos contam, então "1.234,56" e "123456" acham o mesmo valor.
  const [buscaContrato, setBuscaContrato] = useState("");
  const [buscaValor, setBuscaValor] = useState("");
  const digitos = (s: string) => s.replace(/\D/g, "");
  const achados = lista.flatMap((c) =>
    c.repasses.filter((r) => c.contrato.includes(digitos(buscaContrato)) && digitos(reais(r.valor)).includes(digitos(buscaValor))).map((r) => ({ c, r })),
  );
  return (
    <div className="relatorio">
      <div className="acoes nao-imprimir">
        <button type="button" className="botao" onClick={() => window.print()}>
          Imprimir / salvar em PDF
        </button>
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
      <h2>Relatório de conferência{filtro && ` — ${NOME_CONTA[filtro]}`}</h2>
      <p className="caso__meta">
        Gerado em {new Date().toLocaleString("pt-BR")} · {lista.length} contratos ·{" "}
        {secoes.map((s) => `${lista.filter((c) => c.status === s.status).length} ${s.titulo.toLowerCase()}`).join(" · ")}
      </p>
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
              Pesquisar por número do contrato
              <input type="search" inputMode="numeric" value={buscaContrato} onChange={(e) => setBuscaContrato(e.target.value)} placeholder="Ex.: 15215" />
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
      {lista.map((c) => (
        <article key={c.contrato + c.vencimento} className="relatorio__caso">
          <p className="caso__titulo">
            <strong className="relatorio__contrato">
              Contrato {c.contrato} · Banco:{" "}
              {[...new Set(c.repasses.map((r) => r.banco))].filter(Boolean).join(", ") ||
                (c.repasses.length ? <span className="selo selo--divergencia">SEM BANCO</span> : "sem extrato")}
            </strong>
            {c.proprietarios.length > 0 && (
              <>
                {" · Proprietário: "}
                <strong className="relatorio__proprietario">{c.proprietarios.join(", ")}</strong>
              </>
            )}{" "}
            — <span className={`selo selo--${c.status === "divergencia" ? "divergencia" : c.status === "manual" ? "manual" : "aviso"}`}>{c.aceito ? ACEITO : titulo[c.status]}</span>
          </p>
          <p className="caso__meta">
            {[`venc. ${c.vencimento}`, c.competencia && `competência ${c.competencia}`, c.situacao, c.inquilino && `Inquilino: ${c.inquilino}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <ul className="caso__onde" aria-label="Arquivos lidos">
            {c.onde.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          {c.repasses.length > 0 && (
            <ul className="relatorio__banco" aria-label="Dados bancários">
              {c.repasses.map((r) => (
                <li key={r.id}>
                  <strong>{r.proprietario}</strong>
                  {r.pagamento.documento && ` (${r.pagamento.documento})`} —{" "}
                  {r.banco
                    ? [
                        r.pagamento.forma,
                        r.banco,
                        r.pagamento.agencia && `Ag. ${r.pagamento.agencia}`,
                        r.pagamento.conta && `Conta ${r.pagamento.conta}`,
                        r.pagamento.tipoConta,
                        r.pagamento.descricao && `Obs.: ${r.pagamento.descricao}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "sem dados bancários no extrato"}{" "}
                  · <strong>{reais(r.valor)}</strong>
                  {r.caucao > 0 && ` · depósito caução de ${reais(r.caucao)}: não entra no total`}
                </li>
              ))}
            </ul>
          )}
          <p className="relatorio__remover nao-imprimir">
            {c.repasses.map((r) => (
              // Sem banco (em vermelho): botão cheio; os demais, contornado.
              <button key={r.id} type="button" className={`botao botao--pequeno ${r.banco ? "botao--secundario" : ""}`} onClick={() => aoRemoverRepasse(r.id)}>
                Remover extrato de {r.proprietario}
              </button>
            ))}
          </p>
          <ul>
            {[...c.apontamentos]
              .sort((a, b) => PESO[a.tipo] - PESO[b.tipo])
              .map((a, i) => (
                <li key={`a${i}`}>
                  <span className={`selo selo--${a.tipo}`}>{ROTULO[a.tipo]}</span> {a.texto}
                </li>
              ))}
            {c.conferidos.map((t, i) => (
              <li key={`c${i}`} className="conferido">
                <span aria-hidden="true">✓</span> {t}
              </li>
            ))}
            {c.apontamentos.length + c.conferidos.length === 0 && <li>Nada a conferir: falta o outro documento.</li>}
          </ul>
        </article>
      ))}
    </div>
  );
}

type PropsResultado = {
  casos: Caso[];
  modo: Modo;
  removidos: number;
  aoRemoverRepasse: (id: string) => void;
  aoRestaurar: () => void;
};

export function Resultado({ casos: originais, modo, removidos, aoRemoverRepasse, aoRestaurar }: PropsResultado) {
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

  if (relatorio)
    return (
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
    );

  return (
    <div className="resultado">
      <button type="button" className="botao botao--secundario botao--relatorio" onClick={() => setRelatorio(true)}>
        Ver relatório do que foi conferido
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
