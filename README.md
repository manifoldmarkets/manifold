# Manifold Markets

This [monorepo][] has basically everything involved in running and operating Manifold.

## Getting started

0. Make sure you have [Yarn 1.x][yarn]
1. `$ cd web`
2. `$ yarn`
3. `$ yarn dev:dev`
4. Your site will be available on http://localhost:3000

See [`web/README.md`][web-readme] for more details on hacking on the web client.

## General architecture

Manifold's public API and web app are hosted by [Vercel][vercel]. In general, the web app runs as much as possible on the client; we follow a [JAMStack][jamstack] architecture. All data is stored in Firebase's database, [Cloud Firestore][cloud-firestore]. This is directly accessed by the client for most data access operations.

Operations with complicated contracts (e.g. buying shares) are provided in a separate HTTP API using Firebase's [Cloud Functions][cloud-functions]. Those are deployed separately from the Vercel website; see [`functions/README.md`][functions-readme] for more details.

## Directory overview

- `web/`: UI and business logic for the client. Where most of the site lives. The public API endpoints are also in here.

- `functions/`: Firebase cloud functions, for secure work (e.g. balances, Stripe payments, emails). Also contains in
  `functions/src/scripts/` some Typescript scripts that do ad hoc CLI interaction with Firebase.

- `common/`: Typescript library code shared between `web/` & `functions/`. If you want to look at how the market math
  works, most of that's in here (it gets called from the `placeBet` and `sellBet` endpoints in `functions/`.) Also
  contains in `common/envs` configuration for the different environments (i.e. prod, dev, Manifold for Teams instances.)

- `og-image/`: The OpenGraph image generator; creates the preview images shown on Twitter/social media.

Also: Our docs are currently in [a separate repo](https://github.com/manifoldmarkets/docs). TODO: move them into this monorepo.

## Contributing

Since we are just now open-sourcing things, we will see how things go. Feel free to open issues, submit PRs, and chat about the process on [Discord][discord]. We would prefer [small PRs][small-prs] that we can effectively evaluate and review -- maybe check in with us first if you are thinking to work on a big change.

By contributing to this codebase, you are agreeing to the terms of the [Manifold CLA](https://github.com/manifoldmarkets/manifold/blob/main/.github/CONTRIBUTING.md).

If you need additional access to any infrastructure in order to work on something (e.g. Vercel, Firebase) let us know about that on [Discord][discord] as well.

[vercel]: https://vercel.com/
[jamstack]: https://jamstack.org/
[monorepo]: https://semaphoreci.com/blog/what-is-monorepo
[yarn]: https://classic.yarnpkg.com/lang/en/docs/install/
[web-readme]: https://github.com/manifoldmarkets/manifold/blob/main/web/README.md
[functions-readme]: https://github.com/manifoldmarkets/manifold/blob/main/functions/README.md
[cloud-firestore]: https://firebase.google.com/docs/firestore
[cloud-functions]: https://firebase.google.com/docs/functions
[small-prs]: https://google.github.io/eng-practices/review/developer/small-cls.html
[discord]: https://discord.gg/3Zuth9792G
