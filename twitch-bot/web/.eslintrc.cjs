module.exports = {
  extends: ['plugin:@typescript-eslint/recommended', 'prettier', 'plugin:@next/next/recommended'],
  rules: {
    'react/no-unescaped-entities': 'off',
    '@next/next/no-img-element': 'off',
  },
};
