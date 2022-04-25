# Manifold Markets web

## Getting Started

1. `yarn` to install all dependencies
2. `yarn dev:dev` to bring up a local instance, pointing to dev database)
3. Your site will be available on http://localhost:3000

(`yarn dev` will point you to prod database)

### Running with local emulated database and functions

1. `yarn serve` first in `/functions` and wait for it to start
2. `yarn dev:emulate` will point you to the emulated database

## Formatting

Before committing, run `yarn format` to format your code.

Recommended: Use a [Prettier editor integration](https://prettier.io/docs/en/editors.html) to automatically format on save

## Developer Experience TODOs

- Prevent git pushing if there are Typescript errors?
