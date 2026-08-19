module.exports = {
  plugins: ['lodash', 'unused-imports'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', 'lib'],
  env: {
    node: true,
    // Without this, .js files (jest.config.js) fall back to the ES5 parser
    // and `const` is a syntax error. common/.eslintrc.js sets it for the same
    // reason; .ts files are unaffected either way, since the override below
    // gives them the TypeScript parser.
    es6: true,
  },
  overrides: [
    {
      files: ['**/*.ts'],
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json'],
      },
      rules: {
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-extra-semi': 'off',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
          },
        ],
        'unused-imports/no-unused-imports': 'warn',
        'no-constant-condition': 'off',
      },
    },
  ],
  rules: {
    'linebreak-style': [
      'error',
      process.platform === 'win32' ? 'windows' : 'unix',
    ],
    'lodash/import-scope': [2, 'member'],
  },
}
