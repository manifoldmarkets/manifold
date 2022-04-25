# Manifold Markets

This [monorepo][] has basically everything involved in running and operating Manifold.

## Getting started

All dependencies for everything are managed using [Yarn][yarn]. (Take care to use Yarn 1.x rather than Yarn 2 for now.) Install it and run `yarn` to install them. Then if you want to run the website locally `cd` into `web` and run `yarn dev:dev`. See [`web/README.md`][web-readme] for more details on hacking on the client in particular.

## General architecture

Manifold's public API and web app are hosted by [Vercel][vercel]. In general, the web app runs as much as possible on the client; we follow a [JAMStack][jamstack] architecture. All data is stored in Firebase's database, [Cloud Firestore][cloud-firestore]. This is directly accessed by the client for most data access operations.

Operations with complicated contracts (e.g. buying shares) are provided in a separate HTTP API using Firebase's [Cloud Functions][cloud-functions]. Those are deployed separately from the Vercel website; see [`functions/README.md`][functions-readme] for more details.

## Directory overview

- `web/`: UI and business logic for the client. Where most of the site lives. The public API endpoints are also in here.

- `functions/`: Firebase cloud functions, for secure work (e.g. balances, Stripe payments, emails). Also contains in
  `functions/src/scripts/` some Typescript scripts that do ad hoc CLI interaction with Firebase.

- `common/`: Typescript library code shared between `web/` & `functions/`. Also contains in `common/envs` configuration for
  the different environments (i.e. prod, dev, Manifold for Teams instances.)

- `og-image/`: The OpenGraph image generator; creates the preview images shown on Twitter/social media.

## Contributing

Since we are just now open-sourcing things, we will see how things go. Feel free to open issues, submit PRs, and chat about the process on Discord. We would prefer [small PRs][small-prs] that we can effectively evaluate and review -- maybe check in with us first if you are thinking to work on a big change.

[vercel]: https://vercel.com/
[jamstack]: https://jamstack.org/
[monorepo]: https://semaphoreci.com/blog/what-is-monorepo
[yarn]: https://classic.yarnpkg.com/lang/en/docs/install/
[web-readme]: https://github.com/manifoldmarkets/manifold/blob/main/web/README.md
[functions-readme]: https://github.com/manifoldmarkets/manifold/blob/main/functions/README.md
[cloud-firestore]: https://firebase.google.com/docs/firestore
[cloud-functions]: https://firebase.google.com/docs/functions
[small-prs]: https://google.github.io/eng-practices/review/developer/small-cls.html
