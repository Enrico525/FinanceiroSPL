import { PedidoAnalise } from "../shared/contrato";
import type { Ambiente } from "./ambiente";
import { autenticar } from "./auth";
import { entrar } from "./login";
import { analisarComOpenAI, ErroAnalise } from "./openai";
import { erro, json, requisicaoDoApp } from "./resposta";
import { apagarSessao } from "./sessao";

// Margem sobre LIMITES.caracteresTotais para acentos (UTF-8) e escapes do JSON.
const MAX_BYTES_CORPO = 4 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Ambiente): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/auth/")) {
        if (request.method !== "POST" || !requisicaoDoApp(request, url)) return erro("requisicao_invalida");
        const ip = request.headers.get("CF-Connecting-IP") ?? "local";
        if (!(await env.LIMITADOR.limit({ key: `auth:${ip}` })).success) return erro("limite_requisicoes");

        if (url.pathname === "/auth/entrar") return await entrar(request, env);
        if (url.pathname === "/auth/sair") return json({ ok: true }, 200, { "Set-Cookie": apagarSessao() });
        return json({ erro: "requisicao_invalida" }, 404);
      }

      const usuario = await autenticar(request, env);
      if (!usuario) return erro("nao_autenticado");

      if (url.pathname === "/api/eu" && request.method === "GET") {
        return json({ usuario, desenvolvimento: env.AMBIENTE === "desenvolvimento" });
      }

      if (url.pathname === "/api/analisar" && request.method === "POST") {
        if (!requisicaoDoApp(request, url)) return erro("requisicao_invalida");

        const { success } = await env.LIMITADOR.limit({ key: `analise:${usuario}` });
        if (!success) return erro("limite_requisicoes");

        if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BYTES_CORPO) return erro("texto_muito_extenso");
        const bruto = await request.text();
        if (bruto.length > MAX_BYTES_CORPO) return erro("texto_muito_extenso");

        let corpo: unknown;
        try {
          corpo = JSON.parse(bruto);
        } catch {
          return erro("requisicao_invalida");
        }
        const pedido = PedidoAnalise.safeParse(corpo);
        if (!pedido.success) {
          const extenso = pedido.error.issues.some((i) => i.message === "texto muito extenso");
          return erro(extenso ? "texto_muito_extenso" : "requisicao_invalida");
        }

        return json(await analisarComOpenAI(pedido.data, env));
      }

      return json({ erro: "requisicao_invalida" }, 404);
    } catch (e) {
      const codigo = e instanceof ErroAnalise ? e.codigo : "interno";
      // Somente a categoria. Nunca registrar corpo, texto, senha, resposta da IA ou mensagens de exceção.
      console.error(JSON.stringify({ evento: "erro_api", rota: url.pathname, codigo }));
      return erro(codigo);
    }
  },
};
