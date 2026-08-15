import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: ".output/workers",
    rollupOptions: {
      output: {
        entryFileNames: "project-deletion-worker.mjs",
      },
    },
    ssr: "server/workers/project-deletion-worker.ts",
    target: "node22",
  },
  ssr: {
    noExternal: ["@tali/contracts"],
  },
});
