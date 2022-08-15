# -- Stage 1 -- #
FROM node:16 as builder
WORKDIR /manifold
COPY package.json yarn.lock .
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY common/package.json common/package.json
RUN yarn
COPY . .
RUN yarn --cwd web build
RUN yarn --cwd server build
#CMD ["bash"]

# -- Stage 2 -- #
FROM node:16
WORKDIR /deploy
COPY --from=builder /manifold/web/out static
COPY --from=builder /manifold/server/dist .
COPY --from=builder /manifold/server/data data
EXPOSE 9172
CMD ["node", "bundle.js"]