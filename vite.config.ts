import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    plugins: [vinext(), sites({ mockAuth: true }), cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
      persistState: { path: process.env.KOTOBA_STATE_PATH ?? ".wrangler/state" },
      config: {
        name: "kotoba-dictation-local",
        main: "./build/sites-worker.ts",
        compatibility_date: "2026-05-15",
        compatibility_flags: ["nodejs_compat"],
        d1_databases: [{ binding: "DB", database_name: "kotoba-dictation-local", database_id: "00000000-0000-4000-8000-000000000000" }],
      },
    })],
  };
});
