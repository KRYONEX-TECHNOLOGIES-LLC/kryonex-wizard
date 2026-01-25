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
});
