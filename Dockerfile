# Build argument to determine if building for Home Assistant addon
ARG BUILD_HA_ADDON=false
ARG BUILD_FROM=node:20-alpine

# Build stage - common for both regular and HA addon builds
FROM ${BUILD_FROM} AS build

# Install nodejs/npm if using HA base image (which doesn't include them)
RUN if [ ! -x "$(command -v node)" ]; then \
      apk add --no-cache nodejs npm; \
    fi

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy source files and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Final stage - branches based on BUILD_HA_ADDON arg
FROM ${BUILD_FROM}

ARG BUILD_HA_ADDON=false

# For Home Assistant addon: install nodejs/npm
RUN if [ "$BUILD_HA_ADDON" = "true" ]; then \
      if [ ! -x "$(command -v node)" ]; then \
        apk add --no-cache nodejs npm; \
      fi; \
    fi

WORKDIR /app

# For Home Assistant addon: do full install and build
RUN if [ "$BUILD_HA_ADDON" = "true" ]; then \
      echo "Building for Home Assistant addon"; \
    else \
      mkdir -p /app; \
    fi

COPY --from=build /app/bin /app/bin
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/src/data-points.json /app/bin/

# For regular builds: prune dev dependencies
RUN if [ "$BUILD_HA_ADDON" != "true" ]; then \
      npm prune --production || true; \
    fi

# For Home Assistant addon: copy and setup run.sh
COPY run.sh /run.sh
RUN if [ "$BUILD_HA_ADDON" = "true" ]; then \
      chmod a+x /run.sh; \
    fi

# Set appropriate CMD based on build type
# Note: ARG values don't persist to runtime, so we set CMD at build time
RUN if [ "$BUILD_HA_ADDON" = "true" ]; then \
      echo '#!/bin/sh' > /entrypoint.sh && \
      echo '/run.sh' >> /entrypoint.sh; \
    else \
      echo '#!/bin/sh' > /entrypoint.sh && \
      echo 'node /app/bin/app.js' >> /entrypoint.sh; \
    fi && \
    chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]