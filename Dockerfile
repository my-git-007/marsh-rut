# The multiplayer server only (the browser game is served from GitHub Pages or any static host).
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY server ./server
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/server.js"]
