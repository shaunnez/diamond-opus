# Docker

Multi-stage Dockerfiles for production deployment.

## Overview

This directory contains optimized Dockerfiles for all Diamond Opus services:

- `Dockerfile.api` - REST API service
- `Dockerfile.scheduler` - Batch job scheduler
- `Dockerfile.worker` - Queue consumer for data ingestion
- `Dockerfile.consolidator` - Queue consumer for transformation
- `Dockerfile.dashboard` - React admin dashboard (nginx-served)

## Build Strategy

All Dockerfiles use a **multi-stage build** for minimal production images:

```
┌─────────────────────────────────────────────┐
│ Stage 1: Builder (~800MB)                   │
├─────────────────────────────────────────────┤
│ - Node.js 20 Alpine                         │
│ - Install ALL dependencies (including dev) │
│ - Build TypeScript → JavaScript             │
│ - Compile all packages                      │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Stage 2: Runtime (~150-200MB)               │
├─────────────────────────────────────────────┤
│ - Node.js 20 Alpine                         │
│ - Copy only dist/ directories              │
│ - Install production dependencies only     │
│ - No dev tools, no TypeScript              │
└─────────────────────────────────────────────┘
```

## Building Images

### Build All

```bash
# From repository root
docker build -f docker/Dockerfile.api -t diamond-api .
docker build -f docker/Dockerfile.scheduler -t diamond-scheduler .
docker build -f docker/Dockerfile.worker -t diamond-worker .
docker build -f docker/Dockerfile.consolidator -t diamond-consolidator .
docker build -f docker/Dockerfile.dashboard -t diamond-dashboard .
```

### Build with Tags

```bash
# With version tag
docker build -f docker/Dockerfile.api -t diamond-api:1.0.0 .

# With registry prefix
docker build -f docker/Dockerfile.api -t crdiamondprod.azurecr.io/diamond-api:latest .
```

### Build Arguments

```bash
# Production build
docker build -f docker/Dockerfile.api \
  --build-arg NODE_ENV=production \
  -t diamond-api:prod .
```

## Dockerfile Details

### Dockerfile.api

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/database/package*.json ./packages/database/
COPY packages/nivoda/package*.json ./packages/nivoda/
COPY packages/api/package*.json ./packages/api/
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/*/dist ./packages/
COPY --from=builder /app/packages/*/package.json ./packages/
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]
```

**Includes packages:**
- @diamond/shared
- @diamond/database
- @diamond/nivoda
- @diamond/api

### Dockerfile.scheduler

**Includes packages:**
- @diamond/shared
- @diamond/database
- @diamond/nivoda

**Entry point:** `apps/scheduler/dist/index.js`

### Dockerfile.worker

**Includes packages:**
- @diamond/shared
- @diamond/database
- @diamond/nivoda

**Entry point:** `apps/worker/dist/index.js`

### Dockerfile.consolidator

**Includes packages:**
- @diamond/shared
- @diamond/database
- @diamond/nivoda
- @diamond/pricing-engine

**Entry point:** `apps/consolidator/dist/index.js`

### Dockerfile.dashboard

**Two-stage build:**
1. Node.js Alpine - builds Vite/React app
2. nginx Alpine - serves static files

**Entry point:** nginx serving `/usr/share/nginx/html`

**Port:** 80

Uses `nginx.dashboard.conf` for:
- SPA routing (all routes → index.html)
- API proxy to backend (`/api/` → `http://api:3000/api/`)
- Static asset caching

## Image Sizes

| Image | Size |
|-------|------|
| diamond-api | ~180MB |
| diamond-scheduler | ~150MB |
| diamond-worker | ~150MB |
| diamond-consolidator | ~160MB |
| diamond-dashboard | ~25MB |

## Running Locally

### With Docker Compose (Recommended)

```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    ports:
      - "3000:3000"
    env_file:
      - .env.local

  worker:
    build:
      context: .
      dockerfile: docker/Dockerfile.worker
    env_file:
      - .env.local

  consolidator:
    build:
      context: .
      dockerfile: docker/Dockerfile.consolidator
    env_file:
      - .env.local

  dashboard:
    build:
      context: .
      dockerfile: docker/Dockerfile.dashboard
    ports:
      - "8080:80"
    depends_on:
      - api
```

```bash
docker-compose up --build
```

### Standalone

```bash
# API
docker run -p 3000:3000 \
  -e DATABASE_URL="..." \
  diamond-api

# Worker
docker run \
  -e DATABASE_URL="..." \
  -e AZURE_SERVICE_BUS_CONNECTION_STRING="..." \
  -e NIVODA_ENDPOINT="..." \
  -e NIVODA_USERNAME="..." \
  -e NIVODA_PASSWORD="..." \
  diamond-worker
```

## Pushing to Registry

### Azure Container Registry

```bash
# Login
az acr login --name crdiamondprod

# Tag
docker tag diamond-api crdiamondprod.azurecr.io/diamond-api:latest
docker tag diamond-api crdiamondprod.azurecr.io/diamond-api:$(git rev-parse --short HEAD)

# Push
docker push crdiamondprod.azurecr.io/diamond-api:latest
docker push crdiamondprod.azurecr.io/diamond-api:$(git rev-parse --short HEAD)
```

### GitHub Container Registry

```bash
# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Tag and push
docker tag diamond-api ghcr.io/org/diamond-api:latest
docker push ghcr.io/org/diamond-api:latest
```

## Optimization Tips

### Layer Caching

Dockerfiles are structured for optimal layer caching:

1. Copy package.json files first (changes rarely)
2. Run `npm ci` (cached if package.json unchanged)
3. Copy source files last (changes frequently)

### .dockerignore

Ensure `.dockerignore` excludes:

```
node_modules
dist
*.log
.git
.env*
coverage
```

### BuildKit

Enable BuildKit for faster builds:

```bash
DOCKER_BUILDKIT=1 docker build ...
```

## Health Checks

### API Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

### Worker/Consolidator

No HTTP endpoint - rely on Container Apps liveness probes.

## Security

1. **Non-root user**: Consider adding `USER node` in runtime stage
2. **Minimal base**: Alpine Linux reduces attack surface
3. **No secrets in image**: All secrets via environment variables
4. **Layer scanning**: Use `docker scan` or Azure Defender

## Debugging

### Shell into container

```bash
docker run -it --entrypoint /bin/sh diamond-api
```

### View logs

```bash
docker logs <container-id>
docker logs -f <container-id>  # Follow
```

### Inspect image

```bash
docker inspect diamond-api
docker history diamond-api
```
