# Manifold Markets

## Directory overview

- `web/`: UI and biz logic. Where most of the site lives
- `functions/`: Firebase cloud functions, for secure work (balances, Stripe payments, emails)
- `common/`: shared between web & functions
- `og-image/`: The OpenGraph image generator; creates the preview images shown on Twitter/social media

## Philosophies

- [JAMStack](https://jamstack.org/): Keep things simple, no servers
- [Monorepo](https://semaphoreci.com/blog/what-is-monorepo): Good fit for our current size
- [Small PRs](https://google.github.io/eng-practices/review/developer/small-cls.html): Lots of little changes > one big diff
