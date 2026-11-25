// Bindings e variáveis do Worker (ver wrangler.jsonc e .env.example).
export interface Ambiente {
  AMBIENTE: string;
  /** Secret: chave aleatória (mín. 32 caracteres) que assina os cookies de sessão. Trocar = derrubar todas as sessões. */
  SESSION_SECRET: string;
  OPENAI_MODEL: string;
  /** Secret */
  OPENAI_API_KEY: string;
  /** Secret: https://<projeto>.supabase.co (login pelo Supabase Auth e tabelas em supabase/represados.sql). */
  SUPABASE_URL: string;
  /** Secret: chave secreta do Supabase (sb_secret_… ou service_role). Só o Worker usa. */
  SUPABASE_KEY: string;
  DEV_EMAIL?: string;
  LIMITADOR: RateLimit;
}
