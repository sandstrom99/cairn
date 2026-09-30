// main.tsx: the entry point. Which deployment this bundle talks to is decided at build
// time by VITE_CAIRN_URL, defaulting to the anonymous local deployment on 3210 — the same
// one `vp run -F @cairn/backend dev` pushes to. The secret is not decided here: it is pasted
// into the page and lives in the browser (secret.ts).
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

const url = import.meta.env.VITE_CAIRN_URL ?? "http://127.0.0.1:3210";
const client = new ConvexReactClient(url);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={client}>
      <App url={url} />
    </ConvexProvider>
  </StrictMode>,
);
