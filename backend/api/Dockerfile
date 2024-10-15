# prereq: first do `yarn build` to compile typescript & etc.

FROM node:19-alpine
WORKDIR /usr/src/app

# Install PM2 globally
RUN yarn global add pm2

# first get dependencies in for efficient docker layering
COPY dist/package.json dist/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# then copy over typescript payload
COPY dist ./

ENV PORT=80
EXPOSE 80/tcp

# Use PM2 to run the application
CMD ["pm2-runtime", "backend/api/lib/serve.js"]
