# -- Stage 1 -- #
FROM node:16 as builder
WORKDIR /manifold
COPY package.json yarn.lock .
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY common/package.json common/package.json
RUN yarn
COPY common common
COPY web web
RUN yarn --cwd web build
COPY server server
RUN yarn --cwd server build

# -- Stage 2 -- #
FROM node:16
WORKDIR /deploy
COPY --from=builder /manifold/web/out static
COPY --from=builder /manifold/server/dist .
EXPOSE 9172
CMD ["node", "bundle.js"]