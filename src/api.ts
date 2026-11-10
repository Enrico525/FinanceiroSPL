import type { CodigoErro, PedidoAnalise, ResultadoAnalise } from "../shared/contrato";

const MENSAGENS: Record<CodigoErro, string> = {
  nao_autenticado: "Sua sessão terminou. Recarregue a página para entrar novamente.",
  credenciais_invalidas: "Nome ou senha incorretos.",
  requisicao_invalida: "A solicitação não pôde ser processada. Tente novamente.",
  texto_muito_extenso: "Os documentos têm texto demais para uma única análise.",
  limite_requisicoes: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.",
  timeout: "A análise demorou demais e foi interrompida. Tente novamente.",
  falha_ia: "O serviço de análise está indisponível no momento. Tente novamente mais tarde.",
  resposta_invalida: "A análise retornou um resultado inválido. Repita o procedimento.",
  interno: "Ocorreu um erro inesperado. Tente novamente.",
};

export class ErroApi extends Error {
  constructor(
    message: string,
    readonly codigo?: CodigoErro,
  ) {
    super(message);
  }
}

const DO_APP = { "Content-Type": "application/json", "X-Requested-With": "plataforma-financeira" };

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ErroApi("Sem conexão com o servidor. Verifique sua internet.");
  }
  if (resposta.ok) return resposta.json() as Promise<T>;
  const corpo = (await resposta.json().catch(() => null)) as { erro?: CodigoErro } | null;
  throw new ErroApi(MENSAGENS[corpo?.erro ?? "interno"] ?? MENSAGENS.interno, corpo?.erro);
}

export const buscarUsuario = () => chamar<{ usuario: string; desenvolvimento: boolean }>("/api/eu");

export const entrar = (nome: string, senha: string) =>
  chamar<{ usuario: string }>("/auth/entrar", { method: "POST", headers: DO_APP, body: JSON.stringify({ nome, senha }) });

export const sair = () => chamar<{ ok: true }>("/auth/sair", { method: "POST", headers: DO_APP, body: "{}" });

export const analisar = (pedido: PedidoAnalise, signal: AbortSignal) =>
  chamar<ResultadoAnalise>("/api/analisar", {
    method: "POST",
    headers: DO_APP,
    body: JSON.stringify(pedido),
    signal,
  });
