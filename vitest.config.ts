// Separado do vite.config.ts: o plugin da Cloudflare não roda dentro do Vitest.
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node" } });
