# Staging Environment Configuration
# Copy this file to terraform.tfvars.local and fill in sensitive values

subscription_id = "2dade7a0-6731-4d26-ba6d-02228cccbe2d"
environment     = "staging"
location        = "australiaeast"

# Feature flags
enable_container_apps = false  # Set to true when ready to deploy containers

# SKU configurations (cost-optimized for staging)
servicebus_sku           = "Standard"
storage_replication_type = "LRS"
acr_sku                  = "Basic"

# Scaling (conservative for staging)
api_min_replicas          = 0
api_max_replicas          = 2
worker_min_replicas       = 0
worker_max_replicas       = 3
consolidator_min_replicas = 0
consolidator_max_replicas = 1

# Scheduler runs at 2 AM UTC
scheduler_cron_expression = "0 2 * * *"

# Nivoda staging endpoint
nivoda_endpoint = "https://intg-customer-staging.nivodaapi.net/api/diamonds"

# NOTE: Sensitive values should be provided via:
# - Environment variables: TF_VAR_database_url, TF_VAR_nivoda_username, etc.
# - Or a separate terraform.tfvars.local file (gitignored)
