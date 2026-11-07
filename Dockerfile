# The multiplayer server only (the browser game is served from GitHub Pages or any static host).
# Node 24: the server keeps the front page's "notify me" list with Node's built-in SQLite (server/notify.js).
FROM node:24-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY server ./server
ENV NODE_ENV=production PORT=8080 NOTIFY_DB=/data/notify.db
EXPOSE 8080
# Fly mounts its volume at /data owned by root, so the container starts as root only long enough to hand /data to
# the unprivileged "node" user, then runs the server as that user.
CMD ["sh", "-c", "mkdir -p /data && chown -R node:node /data && exec su-exec node node server/server.js"]
