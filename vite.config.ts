// The one config `vp check` and `vp run` read at the workspace root. Formatting and
// linting are oxfmt and oxlint with their defaults; the type check runs across every
// tsconfig in the tree. Generated Convex code is never formatted or linted, and
// markdown and yaml are left as written.
import { defineConfig } from "vite-plus";

export default defineConfig({
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
  run: {
    cache: true,
  },
});
