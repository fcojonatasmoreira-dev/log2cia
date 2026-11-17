import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { localApiPlugin } from "./server/api/vite.js";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localApiPlugin()],
});
