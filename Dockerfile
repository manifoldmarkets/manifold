FROM node:18

ADD package.json /tmp/package.json
RUN cd /tmp && npm install
RUN mkdir -p /opt/manifold && cp -a /tmp/node_modules /opt/manifold/

WORKDIR /opt/manifold
ADD . .
RUN yarn

EXPOSE 3000

WORKDIR /opt/manifold/web
ENTRYPOINT ["yarn", "dev:dev"]
