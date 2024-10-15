# prereq: first do `yarn build` to compile typescript & etc.

FROM node:19-alpine
WORKDIR /usr/src/app

# first get dependencies in for efficient docker layering
COPY dist/package.json dist/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# then copy over typescript payload
COPY dist ./

ENV PORT=80
EXPOSE 80/tcp

# 16 GB on the box, give 12 GB to the JS heap
ENTRYPOINT [ "node", "--max-old-space-size=12288", "backend/api/lib/serve.js" ]
