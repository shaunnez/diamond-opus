# Production Environment Configuration
# Copy this file to terraform.tfvars.local and fill in sensitive values

subscription_id = "2dade7a0-6731-4d26-ba6d-02228cccbe2d"
environment     = "prod"
location        = "australiaeast"

# Feature flags
enable_container_apps = false  # Set to true when ready to deploy containers

# SKU configurations (production-grade)
servicebus_sku           = "Standard"
storage_replication_type = "GRS"  # Geo-redundant for production
acr_sku                  = "Standard"

# Scaling (production capacity)
api_min_replicas          = 1
api_max_replicas          = 5
worker_min_replicas       = 1
worker_max_replicas       = 10
consolidator_min_replicas = 1
consolidator_max_replicas = 2

# Scheduler runs at 2 AM UTC
scheduler_cron_expression = "0 2 * * *"

# Nivoda production endpoint
nivoda_endpoint = "https://integrations.nivoda.net/api/diamonds"

# NOTE: Sensitive values should be provided via:
# - Environment variables: TF_VAR_database_url, TF_VAR_nivoda_username, etc.
# - Or a separate terraform.tfvars.local file (gitignored)
