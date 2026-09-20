// The one build-time variable this app reads: which deployment to talk to. Unset, main.tsx
// falls back to the anonymous local deployment on 3210. The secret is never one of these —
// it is pasted into the page and kept in the browser (secret.ts).

interface ImportMetaEnv {
  readonly VITE_CAIRN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * `CAIRN_SECRET` as the dev server read it, and always "" in a build (vite.config.ts).
 * A convenience for the machine the server runs on, never a way to ship a secret.
 */
declare const __CAIRN_DEV_SECRET__: string;
