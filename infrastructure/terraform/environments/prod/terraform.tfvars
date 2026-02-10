# Production Environment Configuration Template
# IMPORTANT: Do NOT commit sensitive values to git!
#
# Usage:
#   1. Copy this file to terraform.tfvars.local (gitignored)
#   2. Fill in sensitive values in the .local file
#   3. Or use environment variables: export TF_VAR_database_password="..."

subscription_id = "2dade7a0-6731-4d26-ba6d-02228cccbe2d"
environment     = "prod"
location        = "australiaeast"

# SKU configurations (production-grade)
servicebus_sku            = "Standard"
storage_replication_type  = "GRS" # Geo-redundant for production
storage_enable_versioning = true  # Enable blob versioning for production
acr_sku                   = "Standard"

# Scaling (production capacity)
api_min_replicas          = 1
api_max_replicas          = 5
worker_min_replicas       = 1
worker_max_replicas       = 10
consolidator_min_replicas = 1
consolidator_max_replicas = 2

# Scheduler runs at 2 AM UTC daily
scheduler_cron_expression = "0 2 * * *"

# Nivoda production endpoint
nivoda_endpoint = "https://integrations.nivoda.net/api/diamonds"

# ============================================
# SENSITIVE VALUES BELOW
# Set these via terraform.tfvars.local or environment variables
# ============================================

# Database (Supabase)
# database_host     = "aws-1-ap-southeast-1.pooler.supabase.com"  # Set via TF_VAR_database_host or .local file
# database_port     = 5432
# database_name     = "postgres"
# database_username = "postgres.xxxxxxxxxxxxx"     # Set via TF_VAR_database_username or .local file
# database_password = "your-secure-password"       # Set via TF_VAR_database_password or .local file

# Nivoda API
# nivoda_username = "your-username@example.com"    # Set via TF_VAR_nivoda_username or .local file
# nivoda_password = "your-password"                # Set via TF_VAR_nivoda_password or .local file

# API Configuration
# hmac_secrets = "{\"client1\":\"secret1\",\"client2\":\"secret2\"}"  # Set via TF_VAR_hmac_secrets or .local file

# Alerts (Resend)
# resend_api_key   = "re_xxxxxxxxxx"               # Set via TF_VAR_resend_api_key or .local file
# alert_email_to   = "alerts@yourdomain.com"
# alert_email_from = "noreply@yourdomain.com"


# Nivoda proxy (recommended for domain allowlisting)
# Set these ONLY in production where Nivoda requires a whitelisted domain.
# nivoda_proxy_base_url  = "https://api.fourwords.co.nz"           # Set via TF_VAR_nivoda_proxy_base_url or .local file
# internal_service_token = "super-secret-shared-token"            # Set via TF_VAR_internal_service_token or .local file
