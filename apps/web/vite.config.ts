// The web app's build, dev server and tests. @vitejs/plugin-react gives the JSX transform
// and Fast Refresh; tests sit next to what they test and run in node, rendering to a
// string rather than to a DOM.
//
// `__CAIRN_DEV_SECRET__` is the one place a secret meets this config, and only the dev
// server ever fills it: `CAIRN_SECRET` from the shell or from the gitignored `.env.local`,
// so a developer's own machine does not ask for a paste on every fresh browser. It has no
// `VITE_` prefix on purpose, because vite inlines every `VITE_` variable into whatever it
// builds. A build gets the empty string whatever the environment holds, so no bundle can
// carry a secret, and the page falls back to the one pasted into it (src/secret.ts).
// So does `vp test`, which runs this config as `serve` in mode `test`: without that, a test
// would read the developer's real secret and pass or fail by whose machine it ran on.
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss()],
  // `@/` is src/, the alias shadcn's generated components import through. tsconfig.json
  // names it a second time for the type check.
  resolve: { alias: { "@": `${import.meta.dirname}/src` } },
  define: {
    __CAIRN_DEV_SECRET__: JSON.stringify(
      command === "serve" && mode !== "test"
        ? (loadEnv(mode, import.meta.dirname, "CAIRN_").CAIRN_SECRET ?? "")
        : "",
    ),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
