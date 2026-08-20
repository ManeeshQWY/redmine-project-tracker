import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Focused on the class of bug that actually shipped a crash: react-hooks/rules-of-hooks
// (a hook called after a conditional return, or inside a condition/loop) is an error,
// not just a warning, since it silently crashes the whole component tree in production
// with no compile-time signal — tsc alone never catches it.
export default tseslint.config(
  { ignores: ["dist"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  }
);
