// Contrato entre navegador e Worker. Fonte única: o Worker valida com estes schemas
// e o mesmo schema de resposta é enviado à OpenAI como JSON Schema estrito.
import { z } from "zod";

export const LIMITES = {
  bytesPorArquivo: 20 * 1024 * 1024,
  // Lote do financeiro junta ~350–400 extratos (1 página cada) num PDF só.
  paginasPorDocumento: 1000,
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

// Repasses represados (guardados no Supabase até a conferência ser concluída). Espelha Recibo/Repasse de src/nido/ler.ts.
const Txt = z.string().max(2000);
const Centavos = z.int();
const Recibo = z.strictObject({
  arquivo: Txt,
  pagina: z.int(),
  origem: Txt.optional(),
  contrato: Txt,
  locatario: Txt,
  locador: Txt,
  endereco: Txt,
  vencimento: Txt,
  linhas: z.array(z.strictObject({ vencimento: Txt, historico: Txt, debito: Centavos, credito: Centavos })).max(500),
  pago: Centavos,
});
const Repasse = z.strictObject({
  arquivo: Txt,
  pagina: z.int(),
  origem: Txt.optional(),
  proprietario: Txt,
  banco: Txt,
  pagamento: z.strictObject({ documento: Txt, forma: Txt, agencia: Txt, conta: Txt, tipoConta: Txt, descricao: Txt }),
  contrato: Txt,
  endereco: Txt,
  situacao: Txt,
  taxaAdm: z.int().nullable(),
  inquilino: Txt,
  numero: Txt,
  competencia: Txt,
  vencimento: Txt,
  linhas: z
    .array(
      z.strictObject({ vencimento: Txt, historico: Txt, bruto: Centavos, participacao: Txt, debito: Centavos, credito: Centavos }),
    )
    .max(500),
  pago: Centavos,
});
export const PedidoGuardar = z
  .strictObject({ recibos: z.array(Recibo).max(2000), repasses: z.array(Repasse).max(2000) })
  .refine((p) => p.recibos.length + p.repasses.length > 0, "vazio");
export type PedidoGuardar = z.infer<typeof PedidoGuardar>;
export const PedidoApagar = z.strictObject({ ids: z.array(z.int().positive()).min(1).max(4000) });
export type PedidoApagar = z.infer<typeof PedidoApagar>;
export type Represado =
  | { id: number; tipo: "recibo"; dados: z.infer<typeof Recibo> }
  | { id: number; tipo: "repasse"; dados: z.infer<typeof Repasse> };

export type CodigoErro =
  | "falha_banco"
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
