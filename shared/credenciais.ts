/** Nome sem acento, maiúscula ou espaço extra (busca por proprietário e lista de represados). "  María  Silva " → "maria silva". */
export const normalizarNome = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
