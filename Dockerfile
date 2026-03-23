FROM node:22 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run package:native-demo

FROM node:22 AS runtime

WORKDIR /app/.native-demo-package/native-demo

ENV NODE_ENV=production
ENV JIXIA_HOST=0.0.0.0
ENV JIXIA_PORT=3000
ENV JIXIA_STORAGE_ROOT=/var/lib/jixia/storage
ENV JIXIA_DATABASE_URL=file:/var/lib/jixia/data/jixia.db

COPY --from=build /app/.native-demo-package/native-demo ./

EXPOSE 3000

CMD ["./run-native-demo.sh"]
