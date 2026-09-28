// convex.config.ts: the deployment's one component, the page. `@convex-dev/static-hosting`
// keeps the built `apps/web` in the deployment's own storage and serves it at the site
// root, `https://<name>.convex.site`, answering every path without an extension with
// `index.html`, which is what the page's routes need (docs/design.md §8). The upload is an
// internal function, so only `convex run` with the deployment's admin credentials ships a
// page; `scripts/page.mjs` is that step, and `#push:cloud` runs it after the functions.
//
// cairn has no HTTP routes of its own, so the component owns `/` and anything the app ever
// routes over HTTP lives under `/api`.
import staticHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";

const app = defineApp({ httpPrefix: "/api" });
app.use(staticHosting, { httpPrefix: "/" });

export default app;
