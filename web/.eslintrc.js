module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['lodash'],
  extends: ['plugin:react-hooks/recommended', 'plugin:@next/next/recommended'],
  rules: {
    '@next/next/no-img-element': 'off',
    '@next/next/no-typos': 'off',
    'lodash/import-scope': [2, 'member'],
  },
}
