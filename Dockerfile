FROM node:20-alpine as build

RUN mkdir /app
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    && npm prune --production \
    && mkdir out \
    && mv bin out/ \
    && mv node_modules out/ \
    && cp src/data-points.json out/bin/

FROM node:20-alpine
RUN mkdir /app
WORKDIR /app
COPY --from=build /app/out /app

CMD [ "node", "/app/bin/app.js" ]