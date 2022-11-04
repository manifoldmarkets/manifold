FROM node:16
WORKDIR /app
COPY [^.env]* ./
CMD ["node", "--inspect", "--enable-source-maps", "bundle.js"]
