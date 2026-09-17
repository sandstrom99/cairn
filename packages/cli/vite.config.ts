// Tests sit next to what they test: src/**/*.test.mts. `vp test run` reads this.
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.mts"],
  },
});
