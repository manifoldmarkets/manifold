# prereq: first do `yarn build` to compile typescript & etc.
FROM node:19
WORKDIR /usr/src/app

# Install Python and other build dependencies
RUN apt-get update && apt-get install -y python3 make g++

# first get dependencies in for efficient docker layering
COPY dist/package.json dist/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# then copy over typescript payload
COPY dist ./

ENTRYPOINT [ "node", "backend/api/lib/serve.js" ]
