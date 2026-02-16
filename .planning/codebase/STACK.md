# Technology Stack

**Analysis Date:** 2026-02-17

## Languages

**Primary:**
- TypeScript 5.3.3 - All backend services, packages, and frontend applications

## Runtime

**Environment:**
- Node.js 20.0.0+ (specified in root package.json engines field)

**Package Manager:**
- npm (npm workspaces for monorepo)
- Lockfile: package-lock.json (present)

## Frameworks

**Core Backend:**
- Express 4.18.2 - REST API server in `packages/api`
- GraphQL Request 6.1.0 - GraphQL client for Nivoda API in `packages/nivoda`

**Frontend:**
- React 18.2.0 - UI library for dashboard and storefront
- Vite 5.0.10 - Build tool and dev server for React apps
- React Router 6.21.1 - Routing for dashboard and storefront
- TanStack React Query 5.17.0 - Server state management

**Testing:**
- Vitest 1.1.0 - Test runner and assertion library across all packages
- Supertest 7.2.2 - HTTP assertion library for API integration tests

**Build/Dev:**
- TSC (TypeScript Compiler) - Compilation for backend packages
- tsx 4.6.2 - TypeScript executor for Node.js (dev mode)
- cross-env 7.0.3 - Cross-platform environment variable handling
- dotenv 16.3.1 - Environment variable loading

## Key Dependencies

**Critical:**
- `pg` 8.11.3 - PostgreSQL client driver in `packages/database`
- `@azure/service-bus` 7.9.3 - Azure Service Bus messaging (scheduler, worker, consolidator, API)
- `@azure/storage-blob` 12.30.0 - Azure Blob Storage for watermarks/heatmaps (scheduler, consolidator, API)
- `graphql-request` 6.1.0 - GraphQL client for Nivoda adapter
- `resend` 2.1.0 - Email service SDK for notifications (worker, consolidator, API)
- `pino` 8.17.2 - Structured logging for backend services

**Frontend:**
- `axios` 1.6.2 - HTTP client for API requests
- `date-fns` 3.0.6 - Date/time formatting utilities
- `lucide-react` 0.303.0 - React icon library
- `cors` 2.8.5 - CORS middleware for Express

**Infrastructure & Utilities:**
- `zod` 3.22.4 - Schema validation in API routes
- `swagger-jsdoc` 6.2.8 - JSDoc-to-Swagger documentation generation
- `swagger-ui-express` 5.0.0 - Swagger UI for API documentation

**Azure SDKs:**
- `@azure/identity` 4.0.0 - Azure authentication
- `@azure/arm-appcontainers` 2.1.0 - Azure Container Apps management (API)

## Configuration

**Environment:**
- Configuration via environment variables (no .env committed to repo)
- `.env.example` documents required variables
- `.env.local`, `.env.staging` provided as templates (not committed)
- Support for both `DATABASE_URL` connection string or individual `DATABASE_*` vars

**Build:**
- `tsconfig.json` - Root TypeScript configuration (target ES2022, module NodeNext, strict mode enabled)
- `tsconfig.check.json` - Separate config for full type checking
- `.eslintrc.cjs` - ESLint config with TypeScript support (CommonJS format, warns on unused vars)
- No .prettierrc present (code formatting left to developer preference or IDE defaults)

**Linting:**
- ESLint 8.55.0 with TypeScript plugin
- ESLint rules: unused var warnings (ignored for `_` prefixed), no-console off, consistent casing enforced

## Platform Requirements

**Development:**
- Node.js 20+
- npm 10+ (for workspaces support)
- Docker and Docker Compose (for local infrastructure)
- PostgreSQL 16 (via Docker for local dev)
- Azurite (Azure Storage emulator for local dev)
- Service Bus Emulator (Azure messaging emulator for local dev)

**Production:**
- Deployment target: Azure Container Apps (via Terraform in `infrastructure/terraform`)
- PostgreSQL database (Supabase or self-managed)
- Azure Service Bus (messaging)
- Azure Blob Storage (watermarks, heatmaps)
- Azure Container Registry (image storage)
- Resend (email service provider)

**Local Development Stack (via Docker Compose):**
- PostgreSQL 16-alpine
- Azurite (Azure Storage Emulator)
- Service Bus Emulator with SQL Server 2022
- Demo feed API server

## Build Outputs

**Backend packages:** Compiled to `dist/` directories with TypeScript source maps and declaration files
**Frontend apps:** Built with Vite, output to `dist/` with optimized production bundles

---

*Stack analysis: 2026-02-17*
