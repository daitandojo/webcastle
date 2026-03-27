# Stage 1: Base
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies for node-gyp (Playwright)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    chromium \
    chromium-chromedriver \
    ca-certificates \
    ttf-freefont \
    udev

# Stage 2: Production
FROM base AS production

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY --chown=node:node . .

# Build TypeScript
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3052 3053

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3052/health || exit 1

# Start
CMD ["node", "dist/index.js"]

# Stage 3: Development
FROM base AS development

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY --chown=node:node . .

USER node

CMD ["npm", "run", "dev"]
