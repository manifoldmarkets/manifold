module.exports = {
  extends: ['eslint:recommended'],
  env: {
    browser: true,
    node: true,
  },
  overrides: [
    {
      files: ['**/*.ts'],
      plugins: ['@typescript-eslint'],
      parser: '@typescript-eslint/parser',
    },
  ],
  rules: {
    'no-unused-vars': 'off',
    'no-constant-condition': ['error', { checkLoops: false }],
  },
}
