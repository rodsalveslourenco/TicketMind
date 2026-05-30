import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: dir,
  base: "/v2/",
  plugins: [react()],
  build: {
    outDir: path.resolve(dir, "..", "dist", "v2"),
    emptyOutDir: true,
  },
});
