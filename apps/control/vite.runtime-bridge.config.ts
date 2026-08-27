import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: ".output/runtime-bridge",
    rollupOptions: {
      output: { entryFileNames: "project-runtime-bridge.mjs" },
    },
    ssr: "server/runtime-bridge/project-runtime-bridge-server.ts",
    target: "node22",
  },
  ssr: { noExternal: ["@tali/contracts"] },
});
