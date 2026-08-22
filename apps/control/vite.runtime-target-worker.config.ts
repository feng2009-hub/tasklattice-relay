import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: ".output/workers",
    rollupOptions: {
      output: {
        entryFileNames: "project-runtime-target-worker.mjs",
      },
    },
    ssr: "server/workers/project-runtime-target-worker.ts",
    target: "node22",
  },
  ssr: {
    noExternal: ["@tali/contracts"],
  },
});
