import type { CodigoErro } from "../shared/contrato";

const STATUS: Record<CodigoErro, number> = {
  nao_autenticado: 401,
  credenciais_invalidas: 401,
  requisicao_invalida: 400,
  texto_muito_extenso: 413,
  limite_requisicoes: 429,
  timeout: 504,
  falha_ia: 502,
  resposta_invalida: 502,
  interno: 500,
};

export function json(corpo: unknown, status = 200, extras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      ...extras,
    },
  });
}

export const erro = (codigo: CodigoErro) => json({ erro: codigo }, STATUS[codigo]);

/** CSRF: só aceita JSON enviado pelo próprio app (mesma origem + header customizado). */
export const requisicaoDoApp = (request: Request, url: URL) =>
  request.headers.get("Origin") === url.origin &&
  request.headers.get("X-Requested-With") === "plataforma-financeira" &&
  !!request.headers.get("Content-Type")?.startsWith("application/json");
