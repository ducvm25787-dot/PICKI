import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/drizzle/**"],
  },
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["**/integrations/**/*.adapter.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: [
      "vitest.config.ts",
      "packages/db/drizzle.config.ts",
      "apps/api/vitest.config.ts",
      "apps/api/test/**/*.ts",
    ],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["**/*.module.ts"],
    rules: {
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
);
