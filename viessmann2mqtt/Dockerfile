ARG BUILD_FROM
FROM $BUILD_FROM

WORKDIR /app

RUN apk add --no-cache \
    nodejs \
    npm

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src
COPY api ./api
COPY scripts ./scripts
COPY tsconfig.json ./

RUN npm run build \
  && npm prune --omit=dev

COPY viessmann2mqtt/run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
