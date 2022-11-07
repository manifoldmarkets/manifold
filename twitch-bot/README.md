# Manifold Markets Twitch Bot

This repo has everything required to host the Manifold Twitch Bot, and associated overlay and dock browser sources for OBS.

![OBS example](/docs/OBS.png)

## Live demo

There is a live demo of this project hosted as a [DigitalOcean App](https://www.digitalocean.com/products/app-platform). The dock demo is available [here](https://king-prawn-app-5btyw.ondigitalocean.app/dock) and the overlay is available [here](https://king-prawn-app-5btyw.ondigitalocean.app/overlay).

It is worth noting that since this is a public demo with no associated Manifold account, you will not be able to create or resolve questions. You will, however, be able to search for existing questions and feature them on the overlay.

## Environmental variables

This Twitch bot requires the following environmental variables to be defined:

- **PUBLIC_FACING_URL**: The public URL of the host server, without trailing slash, e.g. https://manifold.markets
- **TWITCH_BOT_USERNAME**: The username for the Twitch bot account.
- **TWITCH_BOT_OAUTH_TOKEN**: A valid OAuth token for the Twitch bot account obtained via [this](https://twitchapps.com/tmi) tool.
- **TWITCH_BOT_CLIENT_ID**: The client ID of the Twitch app used to authorize new users. This app can be created in the [Twitch Developer Console](https://dev.twitch.tv/console/app).
- **TWITCH_BOT_CLIENT_SECRET**: The client secret of the Twitch app used to authorize new users.
- **TWITCH_BOT_FIREBASE_KEY**: The API key for the relevant Firebase Firestore. This is currently hardcoded - please ask the author of this repo for the key, or modify the code to point to a new Firestore appropriately.

The following environmental variables are available but optional:

- **PORT**: The port on which the webpages and API are hosted. Default: 9172
- **TARGET**: Represents which Manifold site to target and takes one of the following values (default: LOCAL):
  - PROD (https://manifold.markets/)
  - DEV (https://dev.manifold.markets/)
  - PR_DEV (https://dev-git-twitch-prerelease-mantic.vercel.app/)
  - LOCAL (http://localhost:3000/)
- **DEBUG_TWITCH_ACCOUNT**: The Twitch account to attach to when testing the bot locally. This must be all lowercase.

These can either be defined as global environmental variables on the system, or as a `.env` file in the root of the repository.

## Getting started

- Ensure the [environmental variables](#environmental-variables) are correctly configured
- Ensure [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/#windows-stable) is installed
- `$ yarn`
- `$ yarn dev:fullstack`

## Deploying

This repo can be built into a Docker image for deployment to a hosting site. The container host must have all the [environmental variables](#environmental-variables) set.

The Docker image can be built with `docker build -t {IMAGE_NAME} .` in the root of the repository, and run with `docker run --env-file .env -p 9172:9172 -it {IMAGE_NAME}`

## Future development

- [ ] Integrate access to Manifold's Firestore fully to decrease latency when loading markets, detecting new bets and detecting market resolution
- [ ] Port the overlay to a [Twitch Extension](https://www.twitch.tv/p/en/extensions/) to decrease viewer latency when viewing bets
- [ ] Support market types other than binary
- [ ] Rate limit management in the Twitch bot to prioritize outgoing messages when there is a risk of Twitch dropping them
- [ ] Support betting to a percentage
- [ ] Save which markets are currently featured on each Twitch channel to Firestore to support server rebooting without interruption
- [ ] Allow docks to set the group within which markets created through chat will be added
- [ ] Support renewing dock and overlay links in case of a leak
