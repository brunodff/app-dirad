import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwind from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [tailwind(), reactRouter()],
  resolve: {
    alias: {
      // 🔧 Mapeia o pacote para o arquivo ESM correto **com caminho absoluto**
      "@zxing/browser": path.resolve(
        __dirname,
        "node_modules/@zxing/browser/esm/index.js"
      ),
    },
  },
  // Não inclua "@zxing/browser" aqui porque já está resolvido por alias
  optimizeDeps: { include: ["@zxing/library"] },
});
