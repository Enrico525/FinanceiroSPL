import { type Caso } from "../nido/conferir";
import type { Modo } from "../App";

const ROTULO = { divergencia: "Divergência", manual: "Conferir manualmente", aviso: "Aviso" } as const;

function CartaoCaso({ c }: { c: Caso }) {
  return (
    <li className="caso">
      <p className="caso__titulo">
        <strong>Contrato {c.contrato}</strong> · vencimento {c.vencimento}
        {c.competencia && ` · competência ${c.competencia}`}
        {c.situacao && ` · situação ${c.situacao}`}
      </p>
      <p className="caso__pessoas">
        {c.inquilino && <>Inquilino: {c.inquilino}</>}
        {c.proprietarios.length > 0 && <> · Proprietário(s): {c.proprietarios.join(", ")}</>}
      </p>
      {c.apontamentos.length > 0 && (
        <ul>
          {c.apontamentos.map((a, i) => (
            <li key={i}>
              <span className={`selo selo--${a.tipo}`}>{ROTULO[a.tipo]}</span> {a.texto}
            </li>
          ))}
        </ul>
      )}
      <p className="ref">{c.onde.join(" · ")}</p>
    </li>
  );
}

// Textos vêm do PDF: renderizados só como texto pelo React (sem HTML).
const SECOES: { status: Caso["status"]; titulo: string; vazio: string; nota?: string; recolhida?: boolean }[] = [
  { status: "divergencia", titulo: "Divergências", vazio: "Nenhuma divergência encontrada." },
  { status: "manual", titulo: "Conferir manualmente", vazio: "Nenhum caso separado para conferência manual." },
  {
    status: "sem_extrato",
    titulo: "Recibos sem extrato de repasse",
    vazio: "Todos os recibos têm extrato nos arquivos enviados.",
    nota: "O recibo foi pago, mas o repasse não está nos extratos enviados. Confira no NIDO se foi repassado em outro extrato.",
  },
  {
    status: "sem_recibo",
    titulo: "Extratos sem recibo",
    vazio: "Todos os extratos têm recibo nos arquivos enviados.",
    nota: "Normalmente é recibo de outro dia ou banco que não foi enviado.",
    recolhida: true,
  },
  { status: "ok", titulo: "Sem divergência", vazio: "Nenhum contrato sem divergência.", recolhida: true },
];

// A situação vem do extrato; recibo sem extrato não tem situação. "Normal" primeiro, depois em ordem alfabética.
function porSituacao(lista: Caso[]): [string, Caso[]][] {
  const grupos = new Map<string, Caso[]>();
  for (const c of lista) {
    const nome = c.situacao ? `Situação: ${c.situacao}` : "Situação não informada (sem extrato)";
    grupos.set(nome, [...(grupos.get(nome) ?? []), c]);
  }
  return [...grupos].sort(([a], [b]) => Number(b === "Situação: Normal") - Number(a === "Situação: Normal") || a.localeCompare(b, "pt-BR"));
}

// Textos vêm do PDF: renderizados só como texto pelo React (sem HTML).
export function Resultado({ casos, modo }: { casos: Caso[]; modo: Modo }) {
  // Um extrato por vez: os demais recibos ficam sem extrato por definição, então essa seção não interessa.
  const secoes = modo === "um" ? SECOES.filter((s) => s.status !== "sem_extrato") : SECOES;
  const de = (s: Caso["status"]) => casos.filter((c) => c.status === s);
  const n = (s: Caso["status"]) => de(s).length;

  return (
    <div className="resultado">
      <p className="resumo-numeros" role="status">
        {modo === "um" ? casos.length - n("sem_extrato") : casos.length} contratos:{" "}
        <strong>{n("divergencia")} com divergência</strong>, {n("manual")} para conferir manualmente,{" "}
        {modo === "geral" && `${n("sem_extrato")} recibos sem extrato, `}
        {n("sem_recibo")} extratos sem recibo e {n("ok")} sem divergência.
      </p>

      {secoes.map((s) => {
        const lista = de(s.status);
        const titulo = (
          <h2>
            {s.titulo} ({lista.length})
          </h2>
        );
        const corpo = lista.length ? (
          <>
            {s.nota && <p>{s.nota}</p>}
            {porSituacao(lista).map(([situacao, grupo]) => (
              <div key={situacao} className="grupo">
                <h3>
                  {situacao} ({grupo.length})
                </h3>
                <p className="grupo__contratos">Contratos: {grupo.map((c) => c.contrato).join(" · ")}</p>
                <ul className="casos">
                  {grupo.map((c) => (
                    <CartaoCaso key={c.contrato + c.vencimento} c={c} />
                  ))}
                </ul>
              </div>
            ))}
          </>
        ) : (
          <p>{s.vazio}</p>
        );
        return (
          <section key={s.status}>
            {s.recolhida ? (
              <details>
                <summary>{titulo}</summary>
                {corpo}
              </details>
            ) : (
              <>
                {titulo}
                {corpo}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
