FROM node:16
WORKDIR /deploy
COPY . .
EXPOSE 80
CMD ["node", "--inspect", "--enable-source-maps", "bundle.js"]
