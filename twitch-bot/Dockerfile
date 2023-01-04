# -- Stage 1 -- #
FROM node:16 as builder
WORKDIR /manifold/twitch-bot

COPY twitch-bot/package.json yarn.lock ./
COPY twitch-bot/web/package.json web/package.json
COPY twitch-bot/server/package.json server/package.json
COPY twitch-bot/common/package.json common/package.json
RUN yarn

COPY common/package.json ../common/
COPY common/yarn.lock ../common/
RUN yarn --cwd ../common
COPY common ../common

COPY twitch-bot/common common

COPY twitch-bot/web web
RUN yarn --cwd web build

COPY twitch-bot/server server
RUN yarn --cwd server build

# -- Stage 2 -- #
FROM node:16
WORKDIR /deploy
COPY --from=builder /manifold/twitch-bot/web/out static
COPY --from=builder /manifold/twitch-bot/server/dist .
EXPOSE 9172
CMD ["node", "out.js"]