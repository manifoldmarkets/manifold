module.exports = {
  plugins: ['@typescript-eslint', 'unused-imports', 'import'],
  extends: ['eslint:recommended', 'plugin:import/typescript'],
  ignorePatterns: ['lib'],
  env: {
    node: true,
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
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-inferrable-types': 'off',
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
      },
    },
  ],
  rules: {
    'linebreak-style': [
      'error',
      process.platform === 'win32' ? 'windows' : 'unix',
    ],
    'import/extensions': ['error', 'ignorePackages'],
  },
}
