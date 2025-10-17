module.exports = {
  env: { node: true, es2021: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint", "unused-imports", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier"
  ],
  rules: {
    "unused-imports/no-unused-imports": "error",
    "import/order": [
      "warn",
      { "alphabetize": { "order": "asc", "caseInsensitive": true } }
    ]
  }
};
