import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import hds from '@hirobius/hds-toolkit/eslint-plugin';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      '.claude',
      'src/theme/hds-palette.generated.ts',
      'verify-*.mjs',
      'vrfy*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // HDS layout/token discipline (#115 Phase 0): raw controls, raw hex, raw px spacing, sx tokens.
  ...hds.configs.recommended.map((c) => ({ ...c, files: ['src/**/*.tsx'] })),
  // Node-context files (build scripts + config)
  {
    files: ['scripts/**/*.mjs', 'vite.config.ts', 'eslint.config.js', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },
  // Playwright fixtures for the Figma sync: their callbacks run in the page.
  {
    files: ['scripts/figma/states.mjs', 'scripts/figma/extract.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // The Figma sync's in-page walker (a browser script) and its Figma-plugin runtime (top-level
  // await and return, inlined into use_figma scripts) are not modules.
  {
    files: ['scripts/figma/walk.js', 'scripts/figma/figma-runtime.js'],
    languageOptions: {
      sourceType: 'script',
      parserOptions: { ecmaFeatures: { globalReturn: true } },
      globals: { ...globals.browser, figma: 'readonly', DATA: 'readonly' },
    },
  },
  // Serverless functions run on the Edge runtime (web globals + process.env)
  {
    files: ['api/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  // Disable stylistic rules that conflict with Prettier
  prettier,
);
