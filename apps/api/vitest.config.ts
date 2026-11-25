import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://skyhop:skyhop_dev_password@localhost:5432/skyhop_test?schema=public",
      NODE_ENV: "test",
      COOKIE_SECURE: "false",
    },
  },
});
