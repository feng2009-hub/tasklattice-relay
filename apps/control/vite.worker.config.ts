import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: ".output/workers",
    rollupOptions: {
      output: {
        entryFileNames: "control-worker.mjs",
      },
    },
    ssr: "server/workers/control-worker.ts",
    target: "node22",
  },
  ssr: {
    noExternal: ["@tali/contracts"],
  },
});
