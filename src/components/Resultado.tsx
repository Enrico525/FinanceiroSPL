import type { Referencia, ResultadoAnalise } from "../../shared/contrato";
import { chave } from "../conferencia";

type Props = { resultado: ResultadoAnalise; conferidas: Set<string> };

function Ref({ r, conferidas }: { r: Referencia; conferidas: Set<string> }) {
  const ok = conferidas.has(chave(r));
  return (
    <span className={`ref ${ok ? "" : "ref--nao-conferida"}`}>
      Doc. {r.documento}, pág. {r.pagina}
      {!ok && " · trecho não encontrado no documento, confira manualmente"}
    </span>
  );
}

// Todo conteúdo aqui vem do PDF/IA: renderizado só como texto pelo React (sem HTML).
export function Resultado({ resultado, conferidas }: Props) {
  return (
    <div className="resultado">
      <p className="alerta">
        Resultado gerado com auxílio de IA. Confira as informações nos documentos originais antes de tomar decisões.
      </p>

      <section>
        <h2>Resumo</h2>
        <p>{resultado.resumo}</p>
      </section>

      <section>
        <h2>Documentos</h2>
        <ul>
          {resultado.documentos.map((d) => (
            <li key={d.id}>
              <strong>Documento {d.id}:</strong> {d.tipo}
              {d.periodo ? ` · Período: ${d.periodo}` : " · Período não identificado"}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Informações encontradas</h2>
        {resultado.itens.length === 0 ? (
          <p>Nenhuma informação identificada.</p>
        ) : (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th scope="col">Descrição</th>
                  <th scope="col">Data</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Origem</th>
                  <th scope="col">Referência</th>
                </tr>
              </thead>
              <tbody>
                {resultado.itens.map((i, n) => (
                  <tr key={n}>
                    <td>{i.descricao}</td>
                    <td>{i.data_texto ?? "—"}</td>
                    <td className="numero">{i.valor_texto ?? "—"}</td>
                    <td>{i.origem === "literal" ? "Literal no documento" : "Interpretado pela IA"}</td>
                    <td>
                      <Ref r={i.referencia} conferidas={conferidas} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Divergências</h2>
        {resultado.divergencias.length === 0 ? (
          <p>Nenhuma divergência apontada.</p>
        ) : (
          <ul>
            {resultado.divergencias.map((d, n) => (
              <li key={n}>
                {d.precisa_confirmacao && <span className="selo">Precisa de confirmação</span>} {d.descricao}{" "}
                {d.referencias.map((r, k) => (
                  <Ref key={k} r={r} conferidas={conferidas} />
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {resultado.nao_identificado.length > 0 && (
        <section>
          <h2>Não identificado</h2>
          <ul>
            {resultado.nao_identificado.map((t, n) => (
              <li key={n}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {resultado.observacoes.length > 0 && (
        <section>
          <h2>Observações</h2>
          <ul>
            {resultado.observacoes.map((t, n) => (
              <li key={n}>{t}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
