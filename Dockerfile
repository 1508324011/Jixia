FROM node:22 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22 AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV JIXIA_HOST=0.0.0.0
ENV JIXIA_PORT=3000
ENV JIXIA_STORAGE_ROOT=/var/lib/jixia/storage
ENV JIXIA_DATABASE_URL=file:/var/lib/jixia/data/jixia.db

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

EXPOSE 3000

CMD ["npm", "run", "start:server"]
