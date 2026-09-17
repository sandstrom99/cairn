// The one config `vp check`, `vp staged` and `vp run` read at the workspace root. Formatting and
// linting are oxfmt and oxlint with their defaults; the type check runs across every
// tsconfig in the tree. Generated Convex code is never formatted or linted, and
// markdown and yaml are left as written.
import { defineConfig } from "vite-plus";

export default defineConfig({
  // The pre-commit hook (.vite-hooks/pre-commit runs `vp staged`) formats and lints
  // what is staged, so a commit never carries formatting noise. `vp config` arms it once
  // per clone.
  staged: {
    "*.{ts,mts,tsx,js,mjs,cjs,json,jsonc}": "vp check --fix",
  },
  fmt: {
    // Markdown and yaml are prose and config written by hand; oxfmt stays off them.
    ignorePatterns: ["backend/convex/_generated/**", "**/*.md", "**/*.yaml", "**/*.yml"],
  },
  lint: {
    ignorePatterns: ["backend/convex/_generated/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  // Task caching stays off. To cache, the runner traces every file a task reads, and
  // on WSL2 that tracer makes esbuild fail with `spawn EBUSY` and the type-aware linter
  // with "Linting could not start", so `vp run verify` could not run its own check.
  // A verification has nothing worth caching anyway.
  run: {
    cache: false,
  },
});
