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
    '@typescript-eslint/no-non-null-assertion': 'off',
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
    'linebreak-style': [
      'error',
      process.platform === 'win32' ? 'windows' : 'unix',
    ],
    'lodash/import-scope': [2, 'member'],
    'unused-imports/no-unused-imports': 'warn',
    'react-hooks/exhaustive-deps': 'off',
    'no-constant-condition': 'off',
  },
  ignorePatterns: ['/public/mtg/*'],
  env: {
    browser: true,
    node: true,
  },
}
