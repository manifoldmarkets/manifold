# prereq: first do `yarn build` to compile typescript & etc.

FROM node:19-alpine
WORKDIR /usr/src/app

# Install PM2 and nginx globally
RUN apk add --no-cache nginx && yarn global add pm2

# first get dependencies in for efficient docker layering
COPY dist/package.json dist/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# then copy over typescript payload
COPY dist ./

# Copy the PM2 ecosystem configuration and nginx config
COPY ecosystem.config.js ./
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80/tcp

# Start both nginx and PM2
CMD nginx && pm2-runtime ecosystem.config.js
