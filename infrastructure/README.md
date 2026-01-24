# Diamond Opus Infrastructure

This directory contains Infrastructure as Code (IaC) for deploying Diamond Opus to Azure.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Azure Resource Group                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Service    │    │   Storage    │    │  Container Registry  │  │
│  │     Bus      │    │   Account    │    │        (ACR)         │  │
│  │              │    │              │    │                      │  │
│  │ - work-items │    │ - watermarks │    │ - diamond-api        │  │
│  │ - work-done  │    │   container  │    │ - diamond-worker     │  │
│  │ - consolidate│    │              │    │ - diamond-scheduler  │  │
│  └──────────────┘    └──────────────┘    │ - diamond-consolidator│ │
│                                          └──────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 Container Apps Environment                     │  │
│  │                                                                │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────┐  ┌───────────┐   │  │
│  │  │   API   │  │ Worker  │  │ Consolidator│  │ Scheduler │   │  │
│  │  │  (HTTP) │  │ (Queue) │  │   (Queue)   │  │   (Cron)  │   │  │
│  │  └─────────┘  └─────────┘  └─────────────┘  └───────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │     Supabase     │
                         │   (PostgreSQL)   │
                         └──────────────────┘
```

## Prerequisites

1. **Azure CLI** - [Install Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
2. **Terraform** >= 1.0 - [Install Terraform](https://learn.hashicorp.com/tutorials/terraform/install-cli)
3. **Azure Subscription** with appropriate permissions

## Quick Start

### 1. First-Time Setup (One-Time)

Bootstrap the Terraform state storage:

```bash
# Login to Azure
az login

# Run bootstrap script
./infrastructure/scripts/bootstrap-tfstate.sh
```

### 2. Deploy Infrastructure

```bash
# Deploy staging environment
./infrastructure/scripts/deploy.sh staging plan    # Preview changes
./infrastructure/scripts/deploy.sh staging apply   # Apply changes

# Deploy production environment
./infrastructure/scripts/deploy.sh prod plan
./infrastructure/scripts/deploy.sh prod apply
```

### 3. Generate .env File

```bash
# Generate .env file with connection strings
./infrastructure/scripts/generate-env.sh staging

# Copy to project root
cp .env.staging .env

# Fill in the remaining values (DATABASE_URL, NIVODA_*, etc.)
```

## Directory Structure

```
infrastructure/
├── scripts/
│   ├── bootstrap-tfstate.sh  # One-time state storage setup
│   ├── deploy.sh             # Deploy infrastructure
│   └── generate-env.sh       # Generate .env from Terraform outputs
├── terraform/
│   ├── modules/
│   │   ├── service-bus/      # Azure Service Bus namespace + queues
│   │   ├── storage/          # Azure Storage Account + containers
│   │   ├── container-registry/ # Azure Container Registry
│   │   └── container-apps/   # Container Apps Environment + apps
│   └── environments/
│       ├── staging/          # Staging environment config
│       └── prod/             # Production environment config
└── README.md
```

## Environments

| Environment | Purpose | Scaling | Redundancy |
|-------------|---------|---------|------------|
| **staging** | Development & testing | Scale to 0 | LRS storage |
| **prod** | Production workloads | Always-on | GRS storage |

## Terraform Modules

### service-bus
Creates Service Bus namespace with three queues:
- `work-items` - Scheduler sends work partitions to workers
- `work-done` - Workers report completion
- `consolidate` - Triggers consolidation process

### storage
Creates Storage Account with:
- `watermarks` container - Stores incremental sync state

### container-registry
Creates Azure Container Registry for Docker images.

### container-apps
Creates Container Apps Environment with:
- **API** - HTTP ingress, scales 1-5 replicas
- **Worker** - Service Bus consumer, scales 1-10 replicas
- **Consolidator** - Service Bus consumer, 1-2 replicas
- **Scheduler** - Cron job (runs at 2 AM UTC daily)

## Configuration

### Environment Variables for Terraform

Sensitive values can be provided via environment variables:

```bash
export TF_VAR_database_url="postgresql://..."
export TF_VAR_nivoda_username="user@example.com"
export TF_VAR_nivoda_password="secret"
export TF_VAR_hmac_secrets='{"shopify":"key1","internal":"key2"}'
export TF_VAR_resend_api_key="re_..."
```

### terraform.tfvars

Non-sensitive configuration is in `terraform.tfvars`:

```hcl
subscription_id = "2dade7a0-6731-4d26-ba6d-02228cccbe2d"
environment     = "staging"
location        = "australiaeast"

enable_container_apps = true  # Set to true when ready to deploy containers
```

## GitHub Actions

### Infrastructure Workflow (`.github/workflows/infrastructure.yml`)

- **On PR**: Plans changes for both staging and prod
- **On push to main**: Auto-deploys staging
- **Manual trigger**: Deploy any environment with plan/apply

### CI Workflow (`.github/workflows/ci.yml`)

- **On PR/push**: Build, test, type-check
- **On push to main**: Build Docker images, push to ACR, deploy to staging

### Required Secrets

Configure these in GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `AZURE_CLIENT_ID` | Service principal client ID |
| `AZURE_CLIENT_SECRET` | Service principal secret |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CREDENTIALS` | JSON credentials for `azure/login` action |
| `ACR_LOGIN_SERVER` | ACR login server URL |
| `ACR_USERNAME` | ACR admin username |
| `ACR_PASSWORD` | ACR admin password |

### Creating a Service Principal

```bash
# Create service principal with Contributor role
az ad sp create-for-rbac \
  --name "diamond-opus-github" \
  --role Contributor \
  --scopes /subscriptions/2dade7a0-6731-4d26-ba6d-02228cccbe2d \
  --sdk-auth

# Output JSON goes into AZURE_CREDENTIALS secret
# Also extract individual values for ARM_* secrets
```

## Phased Deployment

### Phase 1: Core Infrastructure (Recommended First)

Deploy just messaging and storage (no containers):

```hcl
# In terraform.tfvars
enable_container_apps = false
```

This creates:
- Service Bus namespace + queues
- Storage Account + watermarks container
- Container Registry

You can run the application locally with these Azure resources.

### Phase 2: Container Apps

When ready to deploy containers:

```hcl
# In terraform.tfvars
enable_container_apps = true
```

Ensure Docker images are pushed to ACR first:

```bash
# Build and push images
docker build -t diamondstagingacr.azurecr.io/diamond-api:latest -f docker/Dockerfile.api .
az acr login --name diamondstagingacr
docker push diamondstagingacr.azurecr.io/diamond-api:latest
# Repeat for other images...
```

## Common Operations

### Get Connection Strings

```bash
cd infrastructure/terraform/environments/staging

# Service Bus
terraform output -raw service_bus_connection_string

# Storage
terraform output -raw storage_connection_string

# Container Registry
terraform output -raw container_registry_login_server
terraform output -raw container_registry_admin_username
terraform output -raw container_registry_admin_password
```

### View Terraform State

```bash
cd infrastructure/terraform/environments/staging
terraform state list
terraform state show module.service_bus.azurerm_servicebus_namespace.main
```

### Destroy Environment

```bash
./infrastructure/scripts/deploy.sh staging destroy
```

## Troubleshooting

### "Backend configuration changed"

Run `terraform init -reconfigure` to update backend configuration.

### "Resource already exists"

If resources were created manually, import them:

```bash
terraform import module.service_bus.azurerm_servicebus_namespace.main \
  /subscriptions/.../resourceGroups/.../providers/Microsoft.ServiceBus/namespaces/...
```

### "Permission denied"

Ensure your Azure account has Contributor access to the subscription.

## Cost Estimation

| Resource | Staging (Monthly) | Production (Monthly) |
|----------|-------------------|----------------------|
| Service Bus Standard | ~$10 | ~$10 |
| Storage Account LRS/GRS | ~$1-5 | ~$5-15 |
| Container Registry Basic/Standard | ~$5 | ~$20 |
| Container Apps | ~$0-50 (scale to 0) | ~$50-200 |
| **Total** | **~$15-70** | **~$85-245** |

*Estimates vary based on usage. Container Apps can scale to zero in staging.*
