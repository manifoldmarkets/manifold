module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['lodash', 'unused-imports'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@next/next/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@next/next/no-img-element': 'off',
    '@next/next/no-typos': 'off',
    'linebreak-style': ['error', 'unix'],
    'lodash/import-scope': [2, 'member'],
    'unused-imports/no-unused-imports': 'warn',
    'linebreak-style': 0,
  },
  ignorePatterns: ['/public/mtg/*'],
  env: {
    browser: true,
    node: true,
  },
}
