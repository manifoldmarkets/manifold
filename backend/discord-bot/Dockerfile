# prereq: first do `yarn build` to compile typescript & etc.

FROM node:19
WORKDIR /usr/src/app

COPY dist/package.json dist/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# then copy over typescript payload
COPY dist ./

CMD ["node", "backend/discord-bot/lib/index.js"]