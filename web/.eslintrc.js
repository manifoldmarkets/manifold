module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['lodash'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@next/next/recommended',
  ],
  rules: {
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@next/next/no-img-element': 'off',
    '@next/next/no-typos': 'off',
    'lodash/import-scope': [2, 'member'],
  },
  env: {
    browser: true,
    node: true,
  },
}
