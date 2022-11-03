# -- Stage 1 -- #
FROM node:16.3.0-alpine as builder
WORKDIR /manifold
RUN npm install -g concurrently
COPY package.json yarn.lock ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY common/package.json common/package.json
RUN yarn
COPY common common
COPY web web
COPY server server
RUN npx concurrently "yarn --cwd web build" "yarn --cwd server build"

# -- Stage 2 -- #
FROM node:16.3.0-alpine
WORKDIR /deploy
COPY --from=builder /manifold/web/out static
COPY --from=builder /manifold/server/dist .
EXPOSE 9172
CMD ["node", "bundle.js"]
