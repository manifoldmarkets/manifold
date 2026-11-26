# AskManifold Twitter bot. Self-contained: doesn't use the monorepo's yarn workspaces.
FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY criteria-guide.md ./

CMD ["node", "src/bot.js"]
