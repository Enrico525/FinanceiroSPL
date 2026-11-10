import { describe, expect, it } from "vitest";
import { LIMITES, PedidoAnalise } from "../shared/contrato";
import { gerarSenha, hashSenha, normalizarNome, normalizarSenha } from "../shared/credenciais";
import type { Ambiente } from "./ambiente";
import { autenticar } from "./auth";
import worker from "./index";
import { COOKIE_SESSAO, criarSessao } from "./sessao";
import { extrairResultado, SCHEMA_RESULTADO } from "./openai";

const doc = (id: "A" | "B", texto = "x") => ({ id, paginas: [{ numero: 1, texto }] });

const URL_APP = "https://financeiro.exemplo.com";
const SENHA = "K7QM-2XPA-9TRF-4WHN";

async function ambiente(extra: Partial<Ambiente> = {}): Promise<Ambiente> {
  return {
    AMBIENTE: "producao",
    SESSION_SECRET: "s".repeat(40),
    USUARIOS: JSON.stringify({ "maria silva": await hashSenha(SENHA), joao: await hashSenha(gerarSenha()) }),
    OPENAI_MODEL: "",
    OPENAI_API_KEY: "",
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

describe("credenciais", () => {
  it("normaliza nome e senha", () => {
    expect(normalizarNome("  María   SILVA ")).toBe("maria silva");
    expect(normalizarSenha("k7qm 2xpa-9trf-4whn")).toBe("K7QM2XPA9TRF4WHN");
  });

  it("gera senhas no formato certo, só com o alfabeto sem ambiguidades, e diferentes", () => {
    const senhas = new Set(Array.from({ length: 50 }, gerarSenha));
    expect(senhas.size).toBe(50);
    for (const s of senhas) expect(s).toMatch(/^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){3}$/);
  });
});

describe("login", () => {
  it("entra com nome e senha corretos (nome e senha tolerantes a maiúsculas/acentos/hífens)", async () => {
    const r = await worker.fetch(login({ nome: "Maria Sílva", senha: "k7qm2xpa9trf4whn" }), await ambiente());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ usuario: "maria silva" });
    expect(r.headers.get("Set-Cookie")).toMatch(/^__Host-sessao=.+; HttpOnly; Secure; SameSite=Strict$/);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("recusa senha errada e nome inexistente com a mesma mensagem", async () => {
    const env = await ambiente();
    for (const corpo of [{ nome: "maria silva", senha: "errada" }, { nome: "fulano", senha: SENHA }, {}]) {
      const r = await worker.fetch(login(corpo), env);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ erro: "credenciais_invalidas" });
      expect(r.headers.get("Set-Cookie")).toBeNull();
    }
  });

  it("recusa login vindo de outro site, sem header do app ou por GET", async () => {
    const env = await ambiente();
    const certo = { nome: "maria silva", senha: SENHA };
    expect((await worker.fetch(login(certo, { Origin: "https://malicioso.com" }), env)).status).toBe(400);
    expect((await worker.fetch(login(certo, { "X-Requested-With": "" }), env)).status).toBe(400);
    expect((await worker.fetch(new Request(`${URL_APP}/auth/entrar`), env)).status).toBe(400);
  });

  it("bloqueia quando o limite de tentativas estoura", async () => {
    const env = await ambiente({ LIMITADOR: { limit: async () => ({ success: false }) } as unknown as RateLimit });
    expect((await worker.fetch(login({ nome: "maria silva", senha: SENHA }), env)).status).toBe(429);
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

  it("aceita sessão válida e revoga na hora quem sai da lista", async () => {
    const env = await ambiente();
    const token = await criarSessao("maria silva", env);
    expect(await autenticar(comSessao(token), env)).toBe("maria silva");
    expect(await autenticar(comSessao(token), { ...env, USUARIOS: JSON.stringify({ joao: "0".repeat(64) }) })).toBeNull();
  });

  it("recusa sem cookie, cookie adulterado, outra chave, expirado ou SESSION_SECRET curto", async () => {
    const env = await ambiente();
    const token = await criarSessao("maria silva", env);
    expect(await autenticar(new Request(`${URL_APP}/api/eu`), env)).toBeNull();
    expect(await autenticar(comSessao(token.slice(0, -2) + "xx"), env)).toBeNull();
    expect(await autenticar(comSessao(token), { ...env, SESSION_SECRET: "t".repeat(40) })).toBeNull();
    expect(await autenticar(comSessao(await criarSessao("maria silva", env, -10)), env)).toBeNull();
    expect(await autenticar(comSessao(token), { ...env, SESSION_SECRET: "curto" })).toBeNull();
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
