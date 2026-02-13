# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code and Prisma schema
COPY . .

# Generate Prisma client and build
# DATABASE_URL is required for Prisma generate, but we use a dummy URL during build
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --only=production --legacy-peer-deps

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
# Note: @prisma/client is already in production dependencies, so it will be installed
# The generated Prisma client is in src/generated/prisma

# Copy Prisma schema and config for migrations
COPY prisma ./prisma
COPY prisma.config.ts ./

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
