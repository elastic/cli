/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/node_modules/**'],
  },
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
    files: ['src/es/apis/schemas/**/*.ts'],
    rules: {
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'off',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
    },
  }
)
