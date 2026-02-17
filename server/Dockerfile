FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
RUN chmod +x ./scripts/start.sh
ENV NODE_ENV=production
CMD ["./scripts/start.sh"]
