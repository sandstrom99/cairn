// Tests run in the edge runtime, which is closer to Convex's own than Node is: no
// Node globals leak into a function under test. `vp test run` reads this.
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/tests/**/*.test.ts"],
  },
});
