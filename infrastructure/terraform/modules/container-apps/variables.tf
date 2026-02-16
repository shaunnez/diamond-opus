# ============================================
# ENVIRONMENT METADATA
# ============================================

variable "environment_name" {
  description = "Name of the Container Apps Environment"
  type        = string
}

variable "app_name_prefix" {
  description = "Prefix for container app names"
  type        = string
}

variable "location" {
  description = "Azure region for resources"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "subscription_id" {
  description = "Azure subscription ID (for API to trigger scheduler job)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

# ============================================
# CONTAINER REGISTRY
# ============================================

variable "container_registry_login_server" {
  description = "Login server URL for the container registry"
  type        = string
}

variable "container_registry_username" {
  description = "Username for the container registry"
  type        = string
}

variable "container_registry_password" {
  description = "Password for the container registry"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.container_registry_password) > 0
    error_message = "container_registry_password cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "image_tag" {
  description = "Docker image tag for worker, API, consolidator, dashboard, and storefront containers (typically commit SHA)"
  type        = string
  default     = "latest"
}

variable "environment_tag" {
  description = "Stable environment tag for scheduler job Docker image (staging or prod). Used by API for scheduler job triggers."
  type        = string
  default     = "staging"
}

# ============================================
# AZURE SERVICES
# ============================================

variable "storage_connection_string" {
  description = "Azure Storage connection string"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.storage_connection_string) > 0
    error_message = "storage_connection_string cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "servicebus_connection_string" {
  description = "Azure Service Bus connection string"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.servicebus_connection_string) > 0
    error_message = "servicebus_connection_string cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "servicebus_namespace" {
  description = "Azure Service Bus namespace name for scale rules"
  type        = string
}

# ============================================
# DATABASE CONFIGURATION
# ============================================

variable "database_host" {
  description = "PostgreSQL host (e.g., db.supabase.co)"
  type        = string
  default     = "aws-1-ap-southeast-1.pooler.supabase.com"

  validation {
    condition     = length(var.database_host) > 0
    error_message = "database_host cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "database_port" {
  description = "PostgreSQL port"
  type        = string
  default     = "5432"

  validation {
    condition     = length(var.database_port) > 0
    error_message = "database_port cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "database_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "postgres"

  validation {
    condition     = length(var.database_name) > 0
    error_message = "database_name cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "database_username" {
  description = "PostgreSQL username"
  type        = string
  sensitive   = true
  default     = "postgres.yazrhmjedaaplwbsaqob"

  validation {
    condition     = length(var.database_username) > 0
    error_message = "database_username cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "database_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
  default     = "superstrongpassword123!"

  validation {
    condition     = length(var.database_password) > 0
    error_message = "database_password cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

# ============================================
# EXTERNAL APIs
# ============================================

## Nivoda API
variable "nivoda_endpoint" {
  description = "Nivoda API endpoint"
  type        = string

  validation {
    condition     = length(var.nivoda_endpoint) > 0
    error_message = "nivoda_endpoint cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "nivoda_username" {
  description = "Nivoda API username"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.nivoda_username) > 0
    error_message = "nivoda_username cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "nivoda_password" {
  description = "Nivoda API password"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.nivoda_password) > 0
    error_message = "nivoda_password cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

## Alerting (Resend)
variable "resend_api_key" {
  description = "Resend API key for email alerts"
  type        = string
  sensitive   = true
  default     = "demo"

  validation {
    condition     = length(var.resend_api_key) > 0
    error_message = "resend_api_key cannot be empty - Azure Container Apps secrets require a non-empty value"
  }
}

variable "alert_email_to" {
  description = "Email address for alerts"
  type        = string
  default     = ""
}

variable "alert_email_from" {
  description = "Email address for sending alerts"
  type        = string
  default     = ""
}

## API Authentication
variable "hmac_secrets" {
  description = "JSON object of HMAC secrets for API authentication"
  type        = string
  sensitive   = true
  default     = "{\"shopify\":\"changeme\",\"internal\":\"changeme\"}"

  validation {
    condition     = length(var.hmac_secrets) > 0
    error_message = "hmac_secrets cannot be empty - Azure Container Apps secrets require a non-empty value. Use '{}' for empty JSON object."
  }
}


# ============================================
# NIVODA PROXY (OPTIONAL)
# ============================================

variable "nivoda_proxy_base_url" {
  description = "Base URL for internal Nivoda proxy (e.g., https://api-test.fourwords.co.nz). When set, workers/scheduler can route Nivoda calls via the API to satisfy domain allowlisting."
  type        = string
  default     = ""
}

variable "internal_service_token" {
  description = "Shared secret token required for internal service-to-service calls (x-internal-token). Only set in environments where internal proxy routes are enabled."
  type        = string
  sensitive   = true
  default     = ""
}

variable "nivoda_proxy_rate_limit" {
  description = "Max Nivoda proxy requests per second (default: 25 for ingestion proxy global limit, 50 for API replica limit)"
  type        = number
  default     = 25
}

variable "nivoda_proxy_rate_limit_max_wait_ms" {
  description = "Max wait time for rate-limited proxy requests before 429 (default: 60000)"
  type        = number
  default     = 60000
}

variable "nivoda_proxy_timeout_ms" {
  description = "Timeout for Nivoda proxy upstream requests in ms (default: 60000)"
  type        = number
  default     = 60000
}

# ============================================
# SCHEDULER CONFIGURATION
# ============================================

variable "scheduler_cron_expression" {
  description = "Cron expression for scheduler job (e.g., '0 2 * * *' for 2 AM daily)"
  type        = string
  default     = "0 */4 * * *"
}

variable "enable_scheduler" {
  description = "Whether to create the scheduled cron job for the scheduler"
  type        = bool
  default     = true
}

variable "scheduler_parallelism" {
  type        = number
  default     = 1
  description = "Parallelism for scheduler job"

  validation {
    condition     = var.scheduler_parallelism >= 1
    error_message = "scheduler_parallelism must be >= 1"
  }
}

# ============================================
# CONTAINER RESOURCES & SCALING
# ============================================

## API Resources
variable "api_cpu" {
  description = "CPU allocation for API container"
  type        = number
  default     = 0.5
}

variable "api_memory" {
  description = "Memory allocation for API container"
  type        = string
  default     = "1Gi"
}

variable "api_min_replicas" {
  description = "Minimum number of API replicas (high availability for customer-facing API)"
  type        = number
  default     = 2
}

variable "api_max_replicas" {
  description = "Maximum number of API replicas for customer traffic (can scale independently now)"
  type        = number
  default     = 10
}

## Worker Resources
variable "worker_cpu" {
  description = "CPU allocation for worker container (I/O bound, 0.25 sufficient)"
  type        = number
  default     = 0.25
}

variable "worker_memory" {
  description = "Memory allocation for worker container (processes 30 items/page)"
  type        = string
  default     = "0.5Gi"
}

variable "worker_min_replicas" {
  description = "Minimum replicas for worker (0 = scale to zero when no messages)"
  type        = number
  default     = 0
}

variable "worker_max_replicas" {
  description = "Maximum replicas for worker"
  type        = number
  default     = 200
}

variable "worker_message_count" {
  description = "Number of Service Bus messages per worker replica for KEDA scaling (lower = more parallelism)"
  type        = number
  default     = 1
}

## Consolidator Resources
variable "consolidator_cpu" {
  description = "CPU allocation for consolidator container"
  type        = number
  default     = 0.5
}

variable "consolidator_memory" {
  description = "Memory allocation for consolidator container (increased for batch operations)"
  type        = string
  default     = "1Gi"
}

variable "consolidator_min_replicas" {
  description = "Minimum replicas for consolidator"
  type        = number
  default     = 1
}

variable "consolidator_max_replicas" {
  description = "Maximum replicas for consolidator (safe with FOR UPDATE SKIP LOCKED)"
  type        = number
  default     = 3
}

## Scheduler Resources
variable "scheduler_cpu" {
  description = "CPU allocation for scheduler job"
  type        = number
  default     = 0.25
}

variable "scheduler_memory" {
  description = "Memory allocation for scheduler job"
  type        = string
  default     = "0.5Gi"
}

## Demo Feed API Resources
variable "demo_feed_api_cpu" {
  description = "CPU allocation for demo feed API container"
  type        = number
  default     = 0.25
}

variable "demo_feed_api_memory" {
  description = "Memory allocation for demo feed API container"
  type        = string
  default     = "0.5Gi"
}

variable "demo_feed_api_min_replicas" {
  description = "Minimum replicas for demo feed API (1 recommended — scheduler/worker depend on it)"
  type        = number
  default     = 1
}

variable "demo_feed_api_max_replicas" {
  description = "Maximum replicas for demo feed API"
  type        = number
  default     = 1
}

## Dashboard Resources
variable "dashboard_cpu" {
  description = "CPU allocation for dashboard container"
  type        = number
  default     = 0.25
}

variable "dashboard_memory" {
  description = "Memory allocation for dashboard container"
  type        = string
  default     = "0.5Gi"
}

variable "dashboard_min_replicas" {
  description = "Minimum replicas for dashboard"
  type        = number
  default     = 1
}

variable "dashboard_max_replicas" {
  description = "Maximum replicas for dashboard"
  type        = number
  default     = 2
}

## Storefront Resources
variable "storefront_cpu" {
  description = "CPU allocation for storefront container"
  type        = number
  default     = 0.25
}

variable "storefront_memory" {
  description = "Memory allocation for storefront container"
  type        = string
  default     = "0.5Gi"
}

variable "storefront_min_replicas" {
  description = "Minimum replicas for storefront"
  type        = number
  default     = 1
}

variable "storefront_max_replicas" {
  description = "Maximum replicas for storefront"
  type        = number
  default     = 2
}

# ============================================
# DATABASE POOLING
# Service-specific pool settings for Supabase shared pooling.
# Keep values low to avoid exhausting pooler connections when scaling replicas.
# ============================================

variable "api_pg_pool_max" {
  description = "Max Postgres connections for API (default: 2, proxy requests don't use DB)"
  type        = number
  default     = 2
}

variable "api_pg_idle_timeout_ms" {
  description = "Postgres idle timeout for API in ms (default: 30000)"
  type        = number
  default     = 30000
}

variable "api_pg_conn_timeout_ms" {
  description = "Postgres connection timeout for API in ms (default: 5000)"
  type        = number
  default     = 5000
}

variable "worker_pg_pool_max" {
  description = "Max Postgres connections per worker replica (default: 1)"
  type        = number
  default     = 1
}

variable "worker_pg_idle_timeout_ms" {
  description = "Postgres idle timeout for worker in ms (release connections faster between Nivoda calls)"
  type        = number
  default     = 2000
}

variable "worker_pg_conn_timeout_ms" {
  description = "Postgres connection timeout for worker in ms (allow time for pgbouncer queuing at high replica count)"
  type        = number
  default     = 10000
}

variable "consolidator_pg_pool_max" {
  description = "Max Postgres connections per consolidator replica (default: 2)"
  type        = number
  default     = 2
}

variable "consolidator_pg_idle_timeout_ms" {
  description = "Postgres idle timeout for consolidator in ms (default: 5000)"
  type        = number
  default     = 5000
}

variable "consolidator_pg_conn_timeout_ms" {
  description = "Postgres connection timeout for consolidator in ms (default: 5000)"
  type        = number
  default     = 5000
}

variable "consolidator_concurrency" {
  description = "Concurrent batch operations for consolidator (should not exceed pg_pool_max)"
  type        = number
  default     = 2
}

variable "scheduler_pg_pool_max" {
  description = "Max Postgres connections for scheduler (default: 2)"
  type        = number
  default     = 2
}

variable "scheduler_pg_idle_timeout_ms" {
  description = "Postgres idle timeout for scheduler in ms (default: 5000)"
  type        = number
  default     = 5000
}

variable "scheduler_pg_conn_timeout_ms" {
  description = "Postgres connection timeout for scheduler in ms (default: 5000)"
  type        = number
  default     = 5000
}

# ============================================
# API SEARCH CACHE
# ============================================

variable "api_cache_max_entries" {
  description = "Max cached search responses per API replica (default: 500)"
  type        = number
  default     = 500
}

variable "api_cache_ttl_ms" {
  description = "Safety TTL for cache entries in ms - entries expire even if version unchanged (default: 300000 = 5min)"
  type        = number
  default     = 300000
}

variable "api_cache_version_poll_interval_ms" {
  description = "How often API polls DB for dataset version changes in ms (default: 30000 = 30s)"
  type        = number
  default     = 30000
}

# ============================================
# OBSERVABILITY
# ============================================

variable "log_analytics_retention_days" {
  description = "Log Analytics workspace retention in days"
  type        = number
  default     = 30
}
