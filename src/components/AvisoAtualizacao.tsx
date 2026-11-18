import { useEffect, useState } from "react";

// Cada publicação gera um /assets/index-<hash>.js novo: se o index.html do servidor aponta para outro, há versão nova.
const scriptDoApp = (html: string) => html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
const CINCO_MINUTOS = 5 * 60 * 1000;

export function AvisoAtualizacao() {
  const [nova, setNova] = useState(false);

  useEffect(() => {
    const atual = scriptDoApp(document.documentElement.outerHTML);
    if (!atual) return; // em desenvolvimento (vite) não há arquivo com hash
    const verificar = () =>
      fetch("/", { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((html) => {
          const servidor = scriptDoApp(html);
          if (servidor && servidor !== atual) setNova(true);
        })
        .catch(() => {}); // sem rede: tenta de novo depois
    const aoVoltar = () => document.visibilityState === "visible" && verificar();
    const timer = setInterval(verificar, CINCO_MINUTOS);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  // Busca o index.html novo antes de recarregar: o reload sozinho pode reaproveitar o do cache do navegador.
  const atualizar = () => fetch("/", { cache: "reload" }).catch(() => {}).finally(() => window.location.reload());

  if (!nova) return null;
  return (
    <p className="alerta aviso-topo" role="status">
      Há uma versão nova do app. Atualizar limpa os arquivos e a conferência que estão na tela.{" "}
      <button type="button" className="botao" onClick={atualizar}>
        Atualizar agora
      </button>
    </p>
  );
}
