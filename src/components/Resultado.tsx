import { useState } from "react";
import { CONTA_BRADESCO, CONTA_ITAU, reais, totais, type Caso, type Conta } from "../nido/conferir";
import type { Modo } from "../App";

const ROTULO = { divergencia: "Divergência", manual: "Conferir", aviso: "Aviso" } as const;
const PESO = { divergencia: 0, manual: 1, aviso: 2 } as const;
// Caso que tinha divergência ou ia para conferência manual e a pessoa marcou como certo (só nesta tela).
type Visto = Caso & { aceito?: boolean };
const ACEITO = "Aceito na conferência manual";

// Textos vêm do PDF: renderizados só como texto pelo React (sem HTML).
function CartaoCaso({ c, aoAceitar }: { c: Visto; aoAceitar: (aceito: boolean) => void }) {
  const meta = [
    `venc. ${c.vencimento}`,
    c.situacao,
    c.proprietarios.length > 0 && `Prop.: ${c.proprietarios.join(", ")}`,
    c.onde.join(" · "),
  ].filter(Boolean);
  return (
    <li className="caso">
      <p className="caso__titulo">
        <strong>Contrato {c.contrato}</strong>
        {c.inquilino && ` · ${c.inquilino}`}
        {c.aceito && (
          <>
            {" "}
            <span className="selo selo--aceito">{ACEITO}</span>
          </>
        )}
      </p>
      <p className="caso__meta">{meta.join(" · ")}</p>
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
};

const NOME_CONTA = { [CONTA_ITAU]: "Itaú", [CONTA_BRADESCO]: "Bradesco" } as const;

function Relatorio({ casos, secoes, escolhas, aoEscolher, aoFechar }: PropsRelatorio) {
  const titulo = Object.fromEntries(SECOES.map((s) => [s.status, s.titulo]));
  const lista = secoes.flatMap((s) => casos.filter((c) => c.status === s.status));
  const t = totais(lista, escolhas);
  const faltam = t.semBanco.filter((r) => !r.conta).length;
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
      <h2>Relatório de conferência</h2>
      <p className="caso__meta">
        Gerado em {new Date().toLocaleString("pt-BR")} · {lista.length} contratos ·{" "}
        {secoes.map((s) => `${casos.filter((c) => c.status === s.status).length} ${s.titulo.toLowerCase()}`).join(" · ")}
      </p>
      <section className="totais" aria-label="Totais a repassar">
        <p className="totais__geral">
          Total a repassar: <strong>{reais(t.geral)}</strong>
        </p>
        <p className="caso__meta">Soma do valor pago/a repassar de {t.repasses} extrato(s) desta conferência.</p>
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
                    <strong className="sem-banco__contrato">Contrato {r.contrato}</strong> · {r.proprietario} · <strong>{reais(r.valor)}</strong>
                  </span>
                  <span className="sem-banco__opcoes" role="radiogroup" aria-label={`Conta do repasse do contrato ${r.contrato}`}>
                    {([CONTA_ITAU, CONTA_BRADESCO] as const).map((conta) => (
                      <label key={conta}>
                        <input type="radio" name={r.chave} checked={r.conta === conta} onChange={() => aoEscolher(r.chave, conta)} /> Somar no{" "}
                        {NOME_CONTA[conta]}
                      </label>
                    ))}
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
            {[`venc. ${c.vencimento}`, c.competencia && `competência ${c.competencia}`, c.situacao, c.inquilino && `Inquilino: ${c.inquilino}`, c.onde.join(" · ")]
              .filter(Boolean)
              .join(" · ")}
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

export function Resultado({ casos: originais, modo }: { casos: Caso[]; modo: Modo }) {
  const [relatorio, setRelatorio] = useState(false);
  // Some ao começar outra conferência: nada é guardado.
  const [aceitos, setAceitos] = useState<Set<string>>(new Set());
  const [escolhas, setEscolhas] = useState<Record<string, Conta>>({});
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
      />
    );

  return (
    <div className="resultado">
      <button type="button" className="botao botao--secundario botao--relatorio" onClick={() => setRelatorio(true)}>
        Ver relatório do que foi conferido
      </button>
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
                  <CartaoCaso key={id(c)} c={c} aoAceitar={(sim) => aceitar(c, sim)} />
                ))}
              </ul>
            </details>
          </section>
        );
      })}
    </div>
  );
}
