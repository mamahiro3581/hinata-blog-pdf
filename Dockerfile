FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY server.cjs ./
COPY public ./public

EXPOSE 4173

CMD ["node", "server.cjs"]
