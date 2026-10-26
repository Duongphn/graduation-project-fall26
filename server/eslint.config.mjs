import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Ranh giới các lớp MVC (xem docs/backend-architecture.md). Chỉ container.ts ghép integrations vào services.
  {
    files: ['src/services/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/integrations/**', '**/controllers/**', '**/routes/**'],
              message: 'Services depend on interfaces/; container.ts wires integrations in.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/controllers/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/models/**', '**/repositories/**', '**/integrations/**'],
              message: 'Controllers call services; data access belongs in services/repositories.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/routes/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/models/**', '**/repositories/**'],
              message: 'Routes only map paths to middlewares and controllers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/models/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/services/**',
                '**/controllers/**',
                '**/routes/**',
                '**/repositories/**',
                '**/integrations/**',
                '**/middlewares/**',
              ],
              message: 'Models may only depend on constants/ and types/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
