/** @type {import('ts-jest').JestConfigWithTsJest} */
const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig')
// API handler regressions run in this suite alongside the script regressions.
const paths = Object.assign({}, compilerOptions.paths, {
  'api/*': ['../api/src/*'],
})

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { baseUrl: __dirname, paths } }],
  },
  moduleNameMapper: pathsToModuleNameMapper(paths, {
    prefix: '<rootDir>/',
  }),
  testMatch: ['**/*.test.ts'],
}
