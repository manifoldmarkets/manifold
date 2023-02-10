# prereq: first do `yarn build` to compile typescript & etc.

FROM node:19-slim
WORKDIR /usr/src/app

# first get dependencies in for efficient docker layering
COPY dist/package.json dist/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# then copy over typescript payload
COPY dist ./

CMD [ "node", "backend/replicator/lib/index.js" ]
