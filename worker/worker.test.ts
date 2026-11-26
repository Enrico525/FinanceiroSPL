import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIMITES, PedidoAnalise } from "../shared/contrato";
import { normalizarNome } from "../shared/credenciais";
import type { Ambiente } from "./ambiente";
import { autenticar } from "./auth";
import worker from "./index";
import { COOKIE_SESSAO, criarSessao } from "./sessao";
import { extrairResultado, SCHEMA_RESULTADO } from "./openai";

const doc = (id: "A" | "B", texto = "x") => ({ id, paginas: [{ numero: 1, texto }] });

const URL_APP = "https://financeiro.exemplo.com";
const SENHA = "senha-de-teste";
const ID = "0b7c2f4e-1111-4222-8333-944445555666";
const EMAIL = "maria@exemplo.com";

// Supabase falso: senha certa só para EMAIL; admin/users devolve `usuaria` (null = apagada); /rest/v1 devolve `rest`.
const chamadas: { url: string; init: RequestInit }[] = [];
const fetchOriginal = globalThis.fetch;
let usuaria: Record<string, unknown> | null = null;
let rest = { status: 200, corpo: "[]" };
beforeEach(() => {
  chamadas.length = 0;
  usuaria = { id: ID, email: EMAIL, banned_until: null };
  rest = { status: 200, corpo: "[]" };
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    chamadas.push({ url, init });
    if (url.includes("/auth/v1/token")) {
      const { email, password } = JSON.parse(init.body as string);
      return email === EMAIL && password === SENHA
        ? Response.json({ access_token: "x", user: { id: ID, email: EMAIL } })
        : Response.json({ error_code: "invalid_credentials" }, { status: 400 });
    }
    if (url.includes("/auth/v1/admin/users/")) return usuaria ? Response.json(usuaria) : new Response("{}", { status: 404 });
    return new Response(rest.corpo, { status: rest.status });
  }) as typeof fetch;
});
afterEach(() => (globalThis.fetch = fetchOriginal));
const doBanco = () => chamadas.filter((c) => c.url.includes("/rest/v1/"));

async function ambiente(extra: Partial<Ambiente> = {}): Promise<Ambiente> {
  return {
    AMBIENTE: "producao",
    SESSION_SECRET: "s".repeat(40),
    OPENAI_MODEL: "",
    OPENAI_API_KEY: "",
    SUPABASE_URL: "https://banco.exemplo.supabase.co",
    SUPABASE_KEY: "sb_secret_teste",
    LIMITADOR: { limit: async () => ({ success: true }) } as unknown as RateLimit,
    ...extra,
  };
}

const comSessao = (token: string) => new Request(`${URL_APP}/api/eu`, { headers: { Cookie: `x=1; ${COOKIE_SESSAO}=${token}` } });

const login = (corpo: unknown, headers: Record<string, string> = {}) =>
  new Request(`${URL_APP}/auth/entrar`, {
    method: "POST",
    headers: {
      Origin: URL_APP,
      "X-Requested-With": "plataforma-financeira",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(corpo),
  });

describe("normalizarNome", () => {
  it("tira acento, maiúscula e espaço extra", () => expect(normalizarNome("  María   SILVA ")).toBe("maria silva"));
});

describe("login", () => {
  it("entra com e-mail (sem diferença de maiúscula) e senha certos, conferidos no Supabase Auth", async () => {
    const r = await worker.fetch(login({ email: "  Maria@Exemplo.com ", senha: SENHA }), await ambiente());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ usuario: EMAIL });
    expect(r.headers.get("Set-Cookie")).toMatch(/^__Host-sessao=.+; HttpOnly; Secure; SameSite=Strict$/);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(chamadas[0].url).toBe("https://banco.exemplo.supabase.co/auth/v1/token?grant_type=password");
    const headers = chamadas[0].init.headers as Record<string, string>;
    expect(headers.apikey).toBe("sb_secret_teste");
    expect(headers.Authorization).toBeUndefined();
  });

  it("recusa senha errada, e-mail inexistente e campos vazios com a mesma mensagem", async () => {
    const env = await ambiente();
    for (const corpo of [{ email: EMAIL, senha: "errada" }, { email: "fulano@exemplo.com", senha: SENHA }, {}]) {
      const r = await worker.fetch(login(corpo), env);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ erro: "credenciais_invalidas" });
      expect(r.headers.get("Set-Cookie")).toBeNull();
    }
  });

  it("Supabase fora do ar não cria sessão", async () => {
    globalThis.fetch = (async () => new Response("x", { status: 500 })) as typeof fetch;
    const r = await worker.fetch(login({ email: EMAIL, senha: SENHA }), await ambiente());
    expect(r.status).toBe(502);
    expect(r.headers.get("Set-Cookie")).toBeNull();
  });

  it("recusa login vindo de outro site, sem header do app ou por GET", async () => {
    const env = await ambiente();
    const certo = { email: EMAIL, senha: SENHA };
    expect((await worker.fetch(login(certo, { Origin: "https://malicioso.com" }), env)).status).toBe(400);
    expect((await worker.fetch(login(certo, { "X-Requested-With": "" }), env)).status).toBe(400);
    expect((await worker.fetch(new Request(`${URL_APP}/auth/entrar`), env)).status).toBe(400);
    expect(chamadas).toHaveLength(0);
  });

  it("bloqueia quando o limite de tentativas estoura", async () => {
    const env = await ambiente({ LIMITADOR: { limit: async () => ({ success: false }) } as unknown as RateLimit });
    expect((await worker.fetch(login({ email: EMAIL, senha: SENHA }), env)).status).toBe(429);
  });

  it("sair apaga o cookie", async () => {
    const r = await worker.fetch(
      new Request(`${URL_APP}/auth/sair`, { method: "POST", headers: { Origin: URL_APP, "X-Requested-With": "plataforma-financeira", "Content-Type": "application/json" }, body: "{}" }),
      await ambiente(),
    );
    expect(r.headers.get("Set-Cookie")).toMatch(/^__Host-sessao=; Path=\/; Max-Age=0;/);
  });
});

describe("autenticar", () => {
  it("aceita o usuário de desenvolvimento só em localhost e nunca em produção", async () => {
    const dev = await ambiente({ AMBIENTE: "desenvolvimento", DEV_EMAIL: "dev@exemplo.local" });
    expect(await autenticar(new Request("http://localhost:5173/api/eu"), dev)).toBe("dev@exemplo.local");
    expect(await autenticar(new Request(`${URL_APP}/api/eu`), dev)).toBeNull();
    expect(await autenticar(new Request("http://localhost/api/eu"), { ...dev, AMBIENTE: "producao" })).toBeNull();
  });

  it("aceita sessão válida e revoga na hora quem foi apagada ou bloqueada no Supabase", async () => {
    const env = await ambiente();
    const token = await criarSessao(ID, env);
    expect(await autenticar(comSessao(token), env)).toBe(EMAIL);
    expect(chamadas.at(-1)!.url).toBe(`https://banco.exemplo.supabase.co/auth/v1/admin/users/${ID}`);
    usuaria = { id: ID, email: EMAIL, banned_until: "2999-01-01T00:00:00Z" };
    expect(await autenticar(comSessao(token), env)).toBeNull();
    usuaria = { id: ID, email: EMAIL, banned_until: "2000-01-01T00:00:00Z" };
    expect(await autenticar(comSessao(token), env)).toBe(EMAIL);
    usuaria = null;
    expect(await autenticar(comSessao(token), env)).toBeNull();
    globalThis.fetch = (async () => {
      throw new Error("rede");
    }) as typeof fetch;
    expect(await autenticar(comSessao(token), env)).toBeNull();
  });

  it("recusa sem cookie, cookie adulterado, outra chave, expirado ou SESSION_SECRET curto", async () => {
    const env = await ambiente();
    const token = await criarSessao(ID, env);
    expect(await autenticar(new Request(`${URL_APP}/api/eu`), env)).toBeNull();
    expect(await autenticar(comSessao(token.slice(0, -2) + "xx"), env)).toBeNull();
    expect(await autenticar(comSessao(token), { ...env, SESSION_SECRET: "t".repeat(40) })).toBeNull();
    expect(await autenticar(comSessao(await criarSessao(ID, env, -10)), env)).toBeNull();
    expect(await autenticar(comSessao(token), { ...env, SESSION_SECRET: "curto" })).toBeNull();
    expect(chamadas).toHaveLength(0);
  });

  it("API exige sessão: /api/eu sem login dá 401", async () => {
    const r = await worker.fetch(new Request(`${URL_APP}/api/eu`), await ambiente());
    expect(r.status).toBe(401);
  });
});

describe("PedidoAnalise", () => {
  it("aceita exatamente A e B", () => {
    expect(PedidoAnalise.safeParse({ documentos: [doc("A"), doc("B")] }).success).toBe(true);
    expect(PedidoAnalise.safeParse({ documentos: [doc("A")] }).success).toBe(false);
    expect(PedidoAnalise.safeParse({ documentos: [doc("A"), doc("B"), doc("B")] }).success).toBe(false);
    expect(PedidoAnalise.safeParse({ documentos: [doc("B"), doc("A")] }).success).toBe(false);
  });

  it("rejeita campos extras (ex.: binário do PDF)", () => {
    const comArquivo = { documentos: [{ ...doc("A"), arquivo: "JVBERi0..." }, doc("B")] };
    expect(PedidoAnalise.safeParse(comArquivo).success).toBe(false);
  });

  it("rejeita texto acima do limite", () => {
    const grande = "x".repeat(LIMITES.caracteresTotais);
    const r = PedidoAnalise.safeParse({ documentos: [doc("A", grande), doc("B")] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.message === "texto muito extenso")).toBe(true);
  });
});

describe("resposta da OpenAI", () => {
  const valido = {
    resumo: "r",
    documentos: [{ id: "A", tipo: "extrato", periodo: null }],
    itens: [],
    divergencias: [],
    nao_identificado: [],
    observacoes: [],
  };
  const resposta = (conteudo: object, status = "completed") => ({
    status,
    output: [{ type: "message", content: [conteudo] }],
  });

  it("extrai e valida o JSON estruturado", () => {
    expect(extrairResultado(resposta({ type: "output_text", text: JSON.stringify(valido) }))).toEqual(valido);
  });

  it("rejeita recusa, resposta incompleta e JSON fora do contrato", () => {
    expect(() => extrairResultado(resposta({ type: "refusal", refusal: "não" }))).toThrow();
    expect(() => extrairResultado(resposta({ type: "output_text", text: "{}" }, "incomplete"))).toThrow();
    expect(() => extrairResultado(resposta({ type: "output_text", text: '{"resumo":1}' }))).toThrow();
  });

  it("gera JSON Schema compatível com o modo estrito", () => {
    expect(SCHEMA_RESULTADO).toMatchObject({ type: "object", additionalProperties: false });
    expect(SCHEMA_RESULTADO).not.toHaveProperty("$schema");
  });
});

describe("represados (Supabase)", () => {
  const recibo = { arquivo: "r.pdf", pagina: 1, contrato: "1", locatario: "Fulano", locador: "Beltrano", endereco: "Rua A", vencimento: "10/11/2026", linhas: [], pago: 100 };
  const pedir = async (caminho: string, corpo?: unknown) => {
    const env = await ambiente();
    const token = await criarSessao(ID, env);
    const headers: Record<string, string> = { Cookie: `${COOKIE_SESSAO}=${token}`, Origin: URL_APP, "X-Requested-With": "plataforma-financeira", "Content-Type": "application/json" };
    return worker.fetch(new Request(`${URL_APP}${caminho}`, corpo === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(corpo) }), env);
  };
  const falsoSupabase = (status = 200) => {
    rest = { status, corpo: status === 200 ? "[]" : "x" };
    chamadas.length = 0;
  };

  it("guarda com o usuário e a chave só no apikey", async () => {
    falsoSupabase();
    const r = await pedir("/api/represados", { recibos: [recibo], repasses: [] });
    expect(r.status).toBe(200);
    expect(doBanco()[0].url).toBe("https://banco.exemplo.supabase.co/rest/v1/represados");
    expect(JSON.parse(doBanco()[0].init.body as string)).toEqual([{ tipo: "recibo", dados: recibo, guardado_por: EMAIL }]);
    expect((doBanco()[0].init.headers as Record<string, string>).apikey).toBe("sb_secret_teste");
  });

  it("conta o limite do corpo em bytes: acento ocupa dois", async () => {
    falsoSupabase();
    // ~2,1 milhões de caracteres, mas ~4,2 MB: passa do limite de 4 MB.
    const r = await pedir("/api/represados", { recibos: [{ ...recibo, locador: "é".repeat(2_100_000) }], repasses: [] });
    expect(await r.json()).toEqual({ erro: "texto_muito_extenso" });
    expect(doBanco()).toHaveLength(0);
  });

  it("recusa dados fora do formato e lote vazio, sem chamar o banco", async () => {
    falsoSupabase();
    expect((await pedir("/api/represados", { recibos: [{ ...recibo, extra: 1 }], repasses: [] })).status).toBe(400);
    expect((await pedir("/api/represados", { recibos: [], repasses: [] })).status).toBe(400);
    expect((await pedir("/api/represados/apagar", { ids: ["1); drop"] })).status).toBe(400);
    expect(doBanco()).toHaveLength(0);
  });

  it("apaga só os ids pedidos e lista", async () => {
    falsoSupabase();
    expect((await pedir("/api/represados/apagar", { ids: [3, 7] })).status).toBe(200);
    expect(doBanco()[0].url).toBe("https://banco.exemplo.supabase.co/rest/v1/represados?id=in.(3,7)");
    expect(doBanco()[0].init.method).toBe("DELETE");
    expect(await (await pedir("/api/represados")).json()).toEqual({ itens: [], nomes: [], grupos: {} });
    expect(doBanco().map((c) => c.url).slice(1)).toEqual([
      "https://banco.exemplo.supabase.co/rest/v1/represados?select=id,tipo,dados&order=id",
      "https://banco.exemplo.supabase.co/rest/v1/represados_nomes?select=nome,grupo",
    ]);
  });

  it("falha do banco vira falha_banco; sem login não chega ao banco", async () => {
    falsoSupabase(500);
    expect(await (await pedir("/api/represados")).json()).toEqual({ erro: "falha_banco" });
    chamadas.length = 0;
    const r = await worker.fetch(new Request(`${URL_APP}/api/represados`), await ambiente());
    expect(r.status).toBe(401);
    expect(doBanco()).toHaveLength(0);
  });
});
