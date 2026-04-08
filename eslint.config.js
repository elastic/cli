import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      }
    }
  },
  {
    // Generated Zod schemas use two patterns that trigger lint rules:
    //   1. `export const Foo` + `export type Foo = z.infer<typeof Foo>` — no-redeclare
    //   2. Forward references via z.lazy(() => Name) — no-use-before-define
    // Both are intentional, correct TypeScript. Suppress them for this directory only.
    files: ['src/es/apis/schemas/**/*.ts'],
    rules: {
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'off',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
    },
  }
)
