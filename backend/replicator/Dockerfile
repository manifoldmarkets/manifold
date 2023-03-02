# prereq: first do `yarn build` to compile typescript & etc.

FROM node:19-alpine
WORKDIR /usr/src/app

# install pg_repack. note that the version must match the version of repack installed in the DB
RUN apk add \
    wget make unzip gcc musl-dev libssl1.1 zlib-dev lz4-dev readline-dev zstd-dev postgresql15-dev
RUN wget -q -O pg_repack.zip "https://api.pgxn.org/dist/pg_repack/1.4.8/pg_repack-1.4.8.zip"
RUN unzip pg_repack.zip && rm pg_repack.zip
WORKDIR pg_repack-1.4.8
RUN make && make install
WORKDIR ..

# first get dependencies in for efficient docker layering
COPY dist/package.json dist/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# then copy over typescript payload
COPY dist ./

ENTRYPOINT [ "node", "backend/replicator/lib/index.js" ]
