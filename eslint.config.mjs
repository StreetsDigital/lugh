import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores (applied to all configs)
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.agents/examples/**',
      '.claude/templates/**', // Ignore template files (not part of main project)
      'workspace/**',
      'worktrees/**',
      '**/*.js', // Ignore JS files (like jest.config.js)
      '*.mjs', // Ignore ESLint config itself
      '**/*.test.ts', // Ignore test files (excluded from tsconfig)

      // Experimental features (disabled in production via feature flags)
      'src/swarm/**', // FEATURE_SWARM_COORDINATION
      'src/api/llm-config.ts', // FEATURE_MULTI_LLM
      'src/api/llm-proxy.ts', // FEATURE_MULTI_LLM
      'src/api/swarm.ts', // FEATURE_SWARM_COORDINATION
      'src/tools/**', // Experimental function tools
      'src/pool/**', // FEATURE_AGENT_POOL
      'src/agent/**', // Experimental agent pool features
      'src/adapters/telegram-agent-approvals.ts', // FEATURE_PHONE_APPROVALS
      'src/clients/langgraph.ts', // LangGraph integration (experimental)
      'langgraph-service/**', // Python service (separate linting)
      'src/memory/**', // Experimental memory/RAG features
      'src/redis/**', // Redis pub/sub (experimental)
    ],
  },

  // Base configs
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Prettier integration (disables conflicting rules)
  prettierConfig,

  // Project-specific settings
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce patterns from codebase analysis
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          // Allow both IInterface and Interface patterns
          custom: { regex: '^I?[A-Z]', match: true },
        },
        { selector: 'typeAlias', format: ['PascalCase'] },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
      ],

      // Relax some overly strict rules for pragmatic TypeScript
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-deprecated': 'warn',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/consistent-generic-constructors': 'warn',
    },
  }
);
