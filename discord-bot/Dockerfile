# prereq: first do `yarn build` to compile typescript & etc.

FROM node:19
WORKDIR /usr/src/app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Will have to rewrite this if we bring in outside dependencies
COPY . ./

CMD ["node", "lib/index.js"]
