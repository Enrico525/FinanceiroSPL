// Contrato entre navegador e Worker. Fonte única: o Worker valida com estes schemas
// e o mesmo schema de resposta é enviado à OpenAI como JSON Schema estrito.
import { z } from "zod";

export const LIMITES = {
  bytesPorArquivo: 20 * 1024 * 1024,
  paginasPorDocumento: 200,
  // Teto provisório; recalibrar após escolher o modelo e medir documentos reais.
  caracteresTotais: 400_000,
  // Abaixo disso, por página em média, o PDF provavelmente é digitalizado.
  caracteresMinimosPorPagina: 20,
} as const;

const IdDocumento = z.enum(["A", "B"]);

const Pagina = z.strictObject({
  numero: z.int().min(1).max(LIMITES.paginasPorDocumento),
  texto: z.string(),
});

const Documento = z.strictObject({
  id: IdDocumento,
  paginas: z.array(Pagina).min(1).max(LIMITES.paginasPorDocumento),
});

export const PedidoAnalise = z
  .strictObject({ documentos: z.tuple([Documento, Documento]) })
  .refine((p) => p.documentos[0].id === "A" && p.documentos[1].id === "B", "ordem dos documentos")
  .refine(
    (p) => p.documentos.flatMap((d) => d.paginas).reduce((n, pg) => n + pg.texto.length, 0) <= LIMITES.caracteresTotais,
    "texto muito extenso",
  );
export type PedidoAnalise = z.infer<typeof PedidoAnalise>;

// PROVISÓRIO: estrutura genérica até definirmos os tipos de documento e as regras de conferência.
const Referencia = z.strictObject({
  documento: IdDocumento,
  pagina: z.int(),
  trecho_literal: z.string(),
});

export const ResultadoAnalise = z.strictObject({
  resumo: z.string(),
  documentos: z.array(
    z.strictObject({ id: IdDocumento, tipo: z.string(), periodo: z.string().nullable() }),
  ),
  itens: z.array(
    z.strictObject({
      descricao: z.string(),
      valor_texto: z.string().nullable(),
      data_texto: z.string().nullable(),
      origem: z.enum(["literal", "interpretado"]),
      referencia: Referencia,
    }),
  ),
  divergencias: z.array(
    z.strictObject({
      descricao: z.string(),
      precisa_confirmacao: z.boolean(),
      referencias: z.array(Referencia),
    }),
  ),
  nao_identificado: z.array(z.string()),
  observacoes: z.array(z.string()),
});
export type ResultadoAnalise = z.infer<typeof ResultadoAnalise>;
export type Referencia = z.infer<typeof Referencia>;

export type CodigoErro =
  | "nao_autenticado"
  | "credenciais_invalidas"
  | "requisicao_invalida"
  | "texto_muito_extenso"
  | "limite_requisicoes"
  | "timeout"
  | "falha_ia"
  | "resposta_invalida"
  | "interno";

export type RespostaErro = { erro: CodigoErro };
