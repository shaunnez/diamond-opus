# Terraform Configuration

This directory contains the Terraform infrastructure-as-code for the Diamond Platform, organized into environments and reusable modules.

## Directory Structure

```
terraform/
├── environments/
│   ├── prod/                 # Production environment
│   │   ├── main.tf           # Resource instantiation
│   │   ├── variables.tf      # Variable declarations
│   │   ├── outputs.tf        # Output definitions
│   │   └── terraform.tfvars  # Configuration template
│   └── staging/              # Staging environment
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── terraform.tfvars
└── modules/
    ├── container-apps/       # Container Apps (API, workers, scheduler, dashboard)
    ├── container-registry/   # Azure Container Registry
    ├── service-bus/          # Azure Service Bus
    └── storage/              # Azure Storage Account
```

## Setup

### Initial Configuration

1. **Copy the terraform.tfvars template** to a local file:
   ```bash
   cd environments/staging  # or prod
   cp terraform.tfvars terraform.tfvars.local
   ```

2. **Fill in sensitive values** in `terraform.tfvars.local`:
   ```hcl
   database_password = "your-actual-password"
   nivoda_username   = "your-nivoda-username"
   nivoda_password   = "your-nivoda-password"
   hmac_secrets      = "{\"client1\":\"secret1\"}"
   resend_api_key    = "re_xxxxxxxxxxxx"
   alert_email_to    = "alerts@yourdomain.com"
   alert_email_from  = "noreply@yourdomain.com"
   ```

3. **Or use environment variables**:
   ```bash
   export TF_VAR_database_password="your-actual-password"
   export TF_VAR_nivoda_username="your-nivoda-username"
   export TF_VAR_nivoda_password="your-nivoda-password"
   export TF_VAR_hmac_secrets='{"client1":"secret1"}'
   export TF_VAR_resend_api_key="re_xxxxxxxxxxxx"
   ```

### Terraform Commands

```bash
# Initialize Terraform (first time or after adding modules)
terraform init

# Format Terraform files
terraform fmt -recursive

# Validate configuration
terraform validate

# Plan changes
terraform plan

# Apply changes
terraform apply

# Destroy resources (use with caution!)
terraform destroy
```

## Sensitive Variables

**NEVER commit these values to git:**
- `database_password` - PostgreSQL password
- `database_username` - PostgreSQL username (contains project ID)
- `nivoda_username` - Nivoda API username
- `nivoda_password` - Nivoda API password
- `hmac_secrets` - JSON object of HMAC client secrets
- `resend_api_key` - Resend API key for email alerts

**Always use:**
- `terraform.tfvars.local` (gitignored) for local development
- Environment variables (`TF_VAR_*`) for CI/CD pipelines
- Azure Key Vault references (future enhancement)

## Variable Organization

Variables are organized into logical sections:

1. **Core Configuration** - Subscription, environment, location, image tags
2. **Infrastructure SKUs** - Service Bus, Storage, Container Registry tiers
3. **Database Configuration** - Supabase connection details
4. **External APIs** - Nivoda, Resend, HMAC secrets
5. **Scheduler Configuration** - Cron expression, parallelism
6. **Container Resources** - CPU/memory allocation per container type
7. **Scaling Configuration** - Min/max replicas for each service
8. **Observability** - Log Analytics retention

## Environment Differences

### Staging
- **Purpose**: Testing and development
- **SKUs**: Basic/Standard (cost-optimized)
- **Storage**: LRS (locally redundant)
- **Scaling**: Min replicas = 0 (scales to zero when idle)
- **Scheduler**: Disabled by default (Feb 31st cron), manual triggers only
- **Log retention**: 7 days

### Production
- **Purpose**: Live production workload
- **SKUs**: Standard (production-grade)
- **Storage**: GRS (geo-redundant) with versioning enabled
- **Scaling**: Min replicas >= 1 (always available)
- **Scheduler**: Runs daily at 2 AM UTC
- **Log retention**: 30 days

## Module Overview

### Container Apps (`modules/container-apps`)
Creates Azure Container Apps Environment and deploys:
- **API** - REST API (external ingress, manual scaling)
- **Worker** - Nivoda data ingestion (KEDA autoscaling on Service Bus queue)
- **Consolidator** - Data consolidation (KEDA autoscaling on Service Bus queue)
- **Scheduler** - Scheduled job (cron-based execution)
- **Dashboard** - React dashboard (external ingress, manual scaling)

### Service Bus (`modules/service-bus`)
Creates Azure Service Bus with queues:
- `work-items` - Worker job queue
- `work-done` - Worker completion notifications
- `consolidate` - Consolidation trigger queue

### Storage (`modules/storage`)
Creates Azure Storage Account with:
- `watermarks` container - Scheduler watermark tracking
- Blob versioning (optional, production only)
- TLS 1.2+ enforcement

### Container Registry (`modules/container-registry`)
Creates Azure Container Registry for Docker images:
- Admin credentials enabled
- Supports Basic, Standard, Premium SKUs

## Common Tasks

### Deploy a New Environment

```bash
# 1. Navigate to environment
cd environments/staging

# 2. Initialize Terraform
terraform init

# 3. Create terraform.tfvars.local with sensitive values
cp terraform.tfvars terraform.tfvars.local
# Edit terraform.tfvars.local with your secrets

# 4. Review the plan
terraform plan

# 5. Apply if plan looks good
terraform apply
```

### Update Container Image Tags

```bash
# Update image_tag in terraform.tfvars or terraform.tfvars.local
image_tag = "abc123def"  # New commit SHA

terraform apply
```

### Scale Resources

```bash
# Update scaling variables in terraform.tfvars.local
worker_max_replicas = 10

terraform apply
```

### Change Scheduler Schedule

```bash
# Update cron expression in terraform.tfvars.local
scheduler_cron_expression = "0 3 * * *"  # 3 AM daily

terraform apply
```

## Validation Rules

Terraform validates input values with these rules:

- **SKUs**: Must be valid Azure SKU names (Basic, Standard, Premium)
- **Replica counts**: Min >= 0, Max >= Min
- **Consolidator max replicas**: Recommended <= 3 (per CLAUDE.md)
- **Log retention**: 7-730 days (Azure limits)
- **Scheduler parallelism**: >= 1

## Troubleshooting

### Runtime Environment Variable Errors

If containers report missing environment variables (e.g., `AZURE_STORAGE_CONNECTION_STRING`):

1. **Force container restart** after terraform apply:
   ```bash
   az containerapp revision restart \
     --name diamond-staging-api \
     --resource-group diamond-staging-rg
   ```

2. **Recreate affected resources**:
   ```bash
   terraform taint 'module.container_apps[0].azurerm_container_app_job.scheduler[0]'
   terraform apply
   ```

3. **Verify secrets in Azure**:
   ```bash
   az containerapp show \
     --name diamond-staging-api \
     --resource-group diamond-staging-rg \
     --query "properties.template.containers[0].env"
   ```

**Note**: Environment variables are correctly configured in Terraform. Runtime errors typically indicate containers need restart or terraform state drift.

### State File Issues

```bash
# Refresh state from Azure
terraform refresh

# Import existing resource
terraform import azurerm_resource_group.main /subscriptions/.../resourceGroups/...
```

### Validation Errors

```bash
# Check which validation failed
terraform validate

# Fix the invalid value in terraform.tfvars.local
# Then run terraform plan again
```

## Security Best Practices

1. **Never commit** `terraform.tfvars.local` or files with secrets
2. **Use `.gitignore`** to prevent accidental commits (already configured)
3. **Rotate secrets** regularly (database passwords, API keys)
4. **Use environment variables** in CI/CD instead of committed files
5. **Enable MFA** on Azure accounts with Terraform access
6. **Review terraform plan** output before applying changes
7. **Use separate Azure subscriptions** for staging and production (optional)

## CI/CD Integration

GitHub Actions workflow pattern:

```yaml
- name: Terraform Plan
  env:
    TF_VAR_database_password: ${{ secrets.DB_PASSWORD }}
    TF_VAR_nivoda_username: ${{ secrets.NIVODA_USERNAME }}
    TF_VAR_nivoda_password: ${{ secrets.NIVODA_PASSWORD }}
    TF_VAR_hmac_secrets: ${{ secrets.HMAC_SECRETS }}
    TF_VAR_resend_api_key: ${{ secrets.RESEND_API_KEY }}
    TF_VAR_environment_tag: ${{ secrets.ENVIRONMENT_TAG }}
  run: terraform plan

- name: Terraform Apply
  if: github.ref == 'refs/heads/main'
  run: terraform apply -auto-approve
```

## Additional Resources

- [Azure Container Apps Documentation](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Terraform Azure Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [CLAUDE.md](../../CLAUDE.md) - Project-specific architecture and conventions
