import { useState, type FormEvent } from "react";
import { entrar, ErroApi } from "../api";

export function Login({ aoEntrar }: { aoEntrar: (usuario: string) => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    setEnviando(true);
    setErro(null);
    try {
      const { usuario } = await entrar(String(dados.get("nome")), String(dados.get("senha")));
      aoEntrar(usuario);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível entrar. Tente novamente.");
      setEnviando(false);
    }
  };

  return (
    <main className="login">
      <form className="login__cartao" onSubmit={enviar}>
        <img src="/marca/logo-login.png" alt="Special Imóveis" className="login__logo" />
        <h1>Conferência Financeira</h1>
        <p className="subtitulo">Acesso restrito a colaboradores autorizados.</p>

        <label className="campo">
          Nome
          <input name="nome" autoComplete="username" required maxLength={100} disabled={enviando} />
        </label>
        <label className="campo">
          Senha
          <input
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            maxLength={100}
            disabled={enviando}
          />
        </label>

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}

        <button type="submit" className="botao login__botao" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        <p className="login__nota">Esqueceu a senha? Peça uma nova ao administrador.</p>
      </form>
    </main>
  );
}
