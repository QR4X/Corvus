import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  {
    ignores: [
      "output/**",
      "storybook/**",
      "storybook-static/**",
      "print/**",
      "scripts/**",
      "tests/**",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.*"] },
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);
