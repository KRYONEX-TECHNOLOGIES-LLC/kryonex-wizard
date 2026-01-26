require("dotenv").config();
require("dotenv").config({ path: "frontend/.env" });
const { defineConfig } = require("cypress");

module.exports = defineConfig({
  video: false,
  defaultCommandTimeout: 10000,
  e2e: {
    baseUrl: process.env.FRONTEND_BASE_URL || "http://localhost:5173",
    specPattern:
      process.env.CYPRESS_SPEC_PATTERN || "cypress/e2e/**/*.spec.{js,ts}",
    supportFile: false,
  },
  env: {
    TEST_EMAIL:
      process.env.CYPRESS_TEST_EMAIL ||
      process.env.TEST_USER_EMAIL ||
      process.env.TEST_EMAIL,
    TEST_PASSWORD:
      process.env.CYPRESS_TEST_PASSWORD ||
      process.env.TEST_USER_PASSWORD ||
      process.env.TEST_PASSWORD,
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY:
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  },
});
