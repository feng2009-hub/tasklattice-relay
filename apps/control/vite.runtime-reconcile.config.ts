import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: ".output/tools",
    rollupOptions: {
      output: {
        entryFileNames: "project-runtime-reconcile.mjs",
      },
    },
    ssr: "server/tools/project-runtime-reconcile.ts",
    target: "node22",
  },
  ssr: {
    noExternal: ["@tali/contracts"],
  },
});
