# prereq: first run `yarn build` to compile TypeScript into the self-contained dist/ tree.
#
# NOTE: this deviates from the house base image (node:20-alpine / musl) on purpose.
# The DuckDB node binding (@duckdb/node-api) ships glibc prebuilt binaries, so we use
# the glibc slim image. This keeps the container binary-compatible with a typical
# glibc developer desktop, satisfying the "same artifact local and in the cloud" goal.
FROM node:20-slim
WORKDIR /usr/src/app

# dependencies first, for docker layer caching
COPY dist/package.json dist/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# then the compiled payload
COPY dist ./

# This image is intended to run as a Cloud Run Job (batch), not a long-lived service.
# All configuration is supplied via environment variables at run time (see .env.example);
# nothing about any particular client is baked into the image.
ENTRYPOINT ["node", "--max-old-space-size=12288", "backend/data-license/lib/index.js"]
