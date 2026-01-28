# Staging Environment Configuration
# ==================================
# Non-sensitive values that can be committed to version control.
# Sensitive values must be provided via environment variables (TF_VAR_*) or a local tfvars file.
#
# For local development:
#   1. Copy terraform.tfvars.local.example to terraform.tfvars.local
#   2. Fill in sensitive values
#   3. Run: terraform plan -var-file="terraform.tfvars" -var-file="terraform.tfvars.local"
#
# For GitHub Actions:
#   Sensitive values are provided via TF_VAR_* environment variables from GitHub Secrets.

# Azure Configuration
subscription_id = "2dade7a0-6731-4d26-ba6d-02228cccbe2d"
environment     = "staging"
location        = "australiaeast"

# SKU configurations (cost-optimized for staging)
servicebus_sku           = "Standard"
storage_replication_type = "LRS"  # Local redundancy for staging
acr_sku                  = "Basic"

# Scaling (cost-optimized - can scale to zero)
api_min_replicas          = 0
api_max_replicas          = 2
worker_min_replicas       = 0
worker_max_replicas       = 3
consolidator_min_replicas = 0
consolidator_max_replicas = 2

# Resource allocation
api_cpu              = 0.25
api_memory           = "0.5Gi"
worker_cpu           = 0.5
worker_memory        = "1Gi"
consolidator_cpu     = 0.5
consolidator_memory  = "1Gi"
scheduler_cpu        = 0.25
scheduler_memory     = "0.5Gi"

# Scheduler runs at 2 AM UTC
scheduler_cron_expression = "0 2 * * *"
scheduler_parallelism     = 1

# Log Analytics (shorter retention for cost savings)
log_analytics_retention_days = 7

# =====================================
# The following MUST be provided via environment variables or terraform.tfvars.local:
#
# TF_VAR_database_host        - Supabase pooler host
# TF_VAR_database_username    - Supabase database username
# TF_VAR_database_password    - Supabase database password
# TF_VAR_nivoda_endpoint      - Nivoda API endpoint (staging)
# TF_VAR_nivoda_username      - Nivoda API username
# TF_VAR_nivoda_password      - Nivoda API password
# TF_VAR_hmac_secrets         - JSON object of HMAC secrets
# TF_VAR_resend_api_key       - Resend API key for alerts
# TF_VAR_alert_email_to       - Alert recipient email
# TF_VAR_alert_email_from     - Alert sender email
