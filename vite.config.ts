import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const packageVersion = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version as string;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      ignored: ["**/src-tauri/target/**"],
    },
  },
  envPrefix: ["VITE_"],
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
  },
  build: {
    target: ["es2022", "chrome118", "safari13"],
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /[\\/]node_modules[\\/]react(?:-dom)?[\\/]/,
            },
            {
              name: "vendor-tauri",
              test: /[\\/]node_modules[\\/]@tauri-apps[\\/]/,
            },
            { name: "icons", test: /[\\/]node_modules[\\/]lucide-react[\\/]/ },
          ],
        },
      },
    },
  },
});
