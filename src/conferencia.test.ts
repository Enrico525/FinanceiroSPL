import { describe, expect, it } from "vitest";
import { chave, conferirReferencias } from "./conferencia";

const textos = {
  A: [{ numero: 2, texto: "Aluguel   março\nR$ 1.250,00" }],
  B: [{ numero: 1, texto: "Repasse proprietário R$ 1.125,00" }],
};

describe("conferirReferencias", () => {
  it("confere trecho existente ignorando espaços e maiúsculas", () => {
    const r = { documento: "A" as const, pagina: 2, trecho_literal: "aluguel março R$ 1.250,00" };
    expect(conferirReferencias([r], textos).has(chave(r))).toBe(true);
  });

  it("sinaliza valor inventado, página errada e trecho vazio", () => {
    const refs = [
      { documento: "A" as const, pagina: 2, trecho_literal: "R$ 1.300,00" },
      { documento: "B" as const, pagina: 9, trecho_literal: "Repasse" },
      { documento: "B" as const, pagina: 1, trecho_literal: "  " },
    ];
    expect(conferirReferencias(refs, textos).size).toBe(0);
  });
});
