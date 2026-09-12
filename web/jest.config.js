module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/web', '<rootDir>/client-common', '<rootDir>/common'],
  roots: ['<rootDir>/web', '<rootDir>/client-common', '<rootDir>/common'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/web/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        diagnostics: false,
        tsconfig: {
          target: 'es2022',
          module: 'commonjs',
          jsx: 'react-jsx',
          esModuleInterop: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^common/(.*)$': '<rootDir>/common/src/$1',
    '^client-common/(.*)$': '<rootDir>/client-common/src/$1',
    '^web/(.*)$': '<rootDir>/web/$1',
    '^react$': require.resolve('react'),
  },
}
