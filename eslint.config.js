// ESLint: catches real bugs (undefined or unused names, unsafe patterns) before a commit.
// Formatting is left to Prettier.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'dist-dev/', 'node_modules/', 'tools/_old/', 'client/public/'] },
  js.configs.recommended,
  {
    // The browser game.
    files: ['client/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    // The simulation shared with the server. It has no browser or Node globals on purpose:
    // using window, document or process here is a bug (see tools/check-shared.js).
    files: ['shared/**/*.js'],
    languageOptions: { globals: {} },
  },
  {
    // The server and the project's own scripts run in Node.
    files: ['server/**/*.js', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // The project's scripts run in Node, and some drive a real browser with Puppeteer.
    files: ['tools/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      // Unused things are errors, except names starting with "_" (deliberately unused).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // An empty catch is how this project says "storage or audio may be unavailable, carry on".
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Security: never build code from strings.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
];
