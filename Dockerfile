FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional || npm install --omit=dev --omit=optional
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
