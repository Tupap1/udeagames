# Imagen minima con Node LTS. Un solo proceso: API de sockets + archivos estaticos.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Primero las dependencias, para aprovechar la cache de capas
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Se ejecuta sin privilegios de root
USER node

EXPOSE 3000
CMD ["node", "server/index.js"]
