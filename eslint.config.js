// ESM flat config for Next.js + TS + React
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import next from "@next/eslint-plugin-next";

export default [
  // Base recommendeds (these are already flat)
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Your project block
  {
    ignores: ["node_modules", ".next", "dist"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      "@next/next": next,
    },
    settings: { react: { version: "detect" } },
    rules: {
      // React/Next common tweaks
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",

      // React Hooks (same effect as plugin:react-hooks/recommended)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // A11y: enable a few high-signal rules (instead of the whole legacy preset)
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/label-has-associated-control": "warn",

      // Next.js examples (add what you like)
      // "@next/next/no-img-element": "warn",
    },
  },
];
