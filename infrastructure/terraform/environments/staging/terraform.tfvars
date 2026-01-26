# Staging Environment Configuration
# Copy this file to terraform.tfvars.local and fill in sensitive values

subscription_id = "2dade7a0-6731-4d26-ba6d-02228cccbe2d"
environment     = "staging"
location        = "australiaeast"

# Feature flags
enable_container_apps = true  # Set to true when ready to deploy containers

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

# Nivoda API Configuration
nivoda_endpoint  = "https://intg-customer-staging.nivodaapi.net/api/diamonds"
nivoda_username  = "testaccount@sample.com"
nivoda_password  = "staging-nivoda-22"
 
# Database (Supabase)
database_url = "postgresql://postgres:superstrongpassword123!@db.yazrhmjedaaplwbsaqob.supabase.co:5432/postgres"
 
# API Configuration
hmac_secrets = "{\"shopify\":\"secret1\",\"internal\":\"secret2\"}"
 
# Alerts (Resend)
resend_api_key   = "re_..."
alert_email_to   = "alerts@example.com"
alert_email_from = "noreply@yourdomain.com"