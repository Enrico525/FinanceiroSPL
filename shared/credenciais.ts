// Usado pelo Worker (login) e pelo script de usuários (geração). Mesma regra nos dois lados.
//
// Senhas são GERADAS: 16 caracteres aleatórios de um alfabeto de 31 (~79 bits).
// Com essa entropia, um SHA-256 simples é seguro (adivinhar exigiria ~2^79 tentativas),
// e evita o hash lento que não caberia no limite de CPU do plano gratuito do Workers.
// shortcut: hash rápido só é aceitável porque a senha NÃO é escolhida por pessoas; se um dia for, trocar por PBKDF2/Argon2.

export const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I/L
export const TAMANHO_SENHA = 16;

/** Login do usuário: minúsculas, sem acentos, espaços simples. "  Maria  Silva " → "maria silva". */
export const normalizarNome = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/** Aceita a senha com ou sem hífens/espaços e em minúsculas. */
export const normalizarSenha = (senha: string) => senha.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function hashSenha(senha: string): Promise<string> {
  const dados = new TextEncoder().encode(normalizarSenha(senha));
  const resumo = new Uint8Array(await crypto.subtle.digest("SHA-256", dados));
  return Array.from(resumo, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gera senha aleatória uniforme (rejeição evita viés do módulo) no formato XXXX-XXXX-XXXX-XXXX. */
export function gerarSenha(): string {
  const limite = 256 - (256 % ALFABETO.length);
  let senha = "";
  while (senha.length < TAMANHO_SENHA) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limite && senha.length < TAMANHO_SENHA) senha += ALFABETO[b % ALFABETO.length];
    }
  }
  return senha.match(/.{4}/g)!.join("-");
}

/** Comparação em tempo constante (para hashes de mesmo tamanho). */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** Formato do Secret USUARIOS: { "<nome normalizado>": "<hash sha-256 hex>" } */
export type MapaUsuarios = Record<string, string>;

export function lerUsuarios(json: string | undefined): MapaUsuarios {
  try {
    const dados = JSON.parse(json ?? "{}") as unknown;
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return {};
    return Object.fromEntries(
      Object.entries(dados).filter(([, v]) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v)),
    ) as MapaUsuarios;
  } catch {
    return {};
  }
}
