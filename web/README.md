# Manifold Markets web app

## Getting started

Manifold's website uses [Next.js][nextjs], which is a [React][react]-based framework that handles concerns like routing,
builds, and a development server. It's also integrated with [Vercel][vercel], which is responsible for hosting the site
and providing some other production functionality like serving the API. The application code is written exclusively in
Typescript. Styling is done via CSS-in-JS in the React code and uses [Tailwind][tailwind] CSS classes.

To run the development server, install [Yarn][yarn], and then in this directory:

1. `yarn` to install all dependencies
2. `yarn dev:dev` starts a development web server, pointing at the development database
3. Your site will be available on http://localhost:3000

Check package.json for other command-line tasks. (e.g. `yarn dev` will point the development server at the prod database. `yarn emulate` will run against a local emulated database, if you are serving it via `yarn serve` from the [`functions/` package][functions-readme].)

## Building and deployment

Vercel's GitHub integration monitors the repository and automatically builds (`next build`) and deploys both the `main`
branch (to production) and PR branches (to ephemeral staging servers that can be used for testing.)

Parts of the file structure that directly map to HTTP endpoints are organized specially per Next.js's prescriptions:

### /public

These are static files that will be [served by Next verbatim][next-static-files].

### /pages

These are components that [Next's router][next-pages] is aware of and interprets as page roots per their filename,
e.g. the React component in pages/portfolio.tsx is rendered on the user portfolio page at /portfolio.

### /pages/api

Modules under this route are specially interpreted by Next/Vercel as [functions that will be hosted by
Vercel][vercel-functions]. This is where the public Manifold HTTP API lives.

## Contributing

Please format the code using [Prettier][prettier]; you can run `yarn format` to invoke it manually. It also runs by
default as a pre-commit Git hook thanks to the pretty-quick package. You may wish to use some kind of fancy [editor
integration][prettier-integrations] to format it in your editor.

## Developer Experience TODOs

- Prevent git pushing if there are Typescript errors?

[react]: https://reactjs.org
[nextjs]: https://nextjs.org
[vercel]: https://vercel.com
[tailwind]: https://tailwindcss.com
[yarn]: https://yarnpkg.com
[prettier]: https://prettier.io
[prettier-integrations]: https://prettier.io/docs/en/editors.html
[next-static-files]: https://nextjs.org/docs/basic-features/static-file-serving
[next-pages]: https://nextjs.org/docs/basic-features/pages
[vercel-functions]: https://vercel.com/docs/concepts/functions/serverless-functions
[functions-readme]: https://github.com/manifoldmarkets/manifold/blob/main/functions/README.md
