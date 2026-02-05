# ============================================
# CORE CONFIGURATION
# ============================================

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "australiaeast"
}

variable "image_tag" {
  description = "Docker image tag for worker, API, consolidator, and dashboard containers (typically commit SHA)"
  type        = string
  default     = "latest"
}

variable "environment_tag" {
  description = "Stable environment tag for scheduler job Docker image (staging or prod). Used by API for scheduler job triggers."
  type        = string
  default     = "prod"
}

# ============================================
# INFRASTRUCTURE SKUs
# ============================================

variable "servicebus_sku" {
  description = "Service Bus SKU"
  type        = string
  default     = "Standard"

  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.servicebus_sku)
    error_message = "servicebus_sku must be Basic, Standard, or Premium"
  }
}

variable "storage_replication_type" {
  description = "Storage replication type (ZRS for cost-optimized zone redundancy)"
  type        = string
  default     = "ZRS"

  validation {
    condition     = contains(["LRS", "GRS", "RAGRS", "ZRS", "GZRS", "RAGZRS"], var.storage_replication_type)
    error_message = "storage_replication_type must be LRS, GRS, RAGRS, ZRS, GZRS, or RAGZRS"
  }
}

variable "storage_enable_versioning" {
  description = "Enable blob versioning for the storage account (recommended for production)"
  type        = bool
  default     = true
}

variable "acr_sku" {
  description = "Container Registry SKU (Basic is sufficient for most workloads)"
  type        = string
  default     = "Basic"

  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.acr_sku)
    error_message = "acr_sku must be Basic, Standard, or Premium"
  }
}

# ============================================
# DATABASE CONFIGURATION (Supabase)
# ============================================

variable "database_host" {
  description = "PostgreSQL host (e.g., db.supabase.co)"
  type        = string
  default     = "aws-1-ap-southeast-1.pooler.supabase.com"
}

variable "database_port" {
  description = "PostgreSQL port"
  type        = string
  default     = "5432"
}

variable "database_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "postgres"
}

variable "database_username" {
  description = "PostgreSQL username"
  type        = string
  sensitive   = true
  default     = "postgres.yazrhmjedaaplwbsaqob"
}

variable "database_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
  default     = "superstrongpassword123!"
}

# ============================================
# EXTERNAL APIs
# ============================================

## Nivoda API
variable "nivoda_endpoint" {
  description = "Nivoda API endpoint"
  type        = string
  default     = "https://integrations.nivoda.net/api/diamonds"
}

variable "nivoda_username" {
  description = "Nivoda API username"
  type        = string
  sensitive   = true
  default     = "testaccount@sample.com"
}

variable "nivoda_password" {
  description = "Nivoda API password"
  type        = string
  sensitive   = true
  default     = "staging-nivoda-22"
}

## Alerting (Resend)
variable "resend_api_key" {
  description = "Resend API key for alerts"
  type        = string
  sensitive   = true
  default     = "demo"
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
  description = "JSON object of HMAC secrets"
  type        = string
  sensitive   = true
  default     = "{}"
}

# ============================================
# SCHEDULER CONFIGURATION
# ============================================

variable "scheduler_cron_expression" {
  description = "Cron expression for scheduler job. Use '0 2 * * *' for 2 AM daily. Use '0 0 31 2 *' (Feb 31st) to disable scheduled runs while keeping manual trigger capability."
  type        = string
  default     = "0 2 * * *"
}

variable "enable_scheduler" {
  description = "Whether to create the scheduled cron job for the scheduler"
  type        = bool
  default     = true # Production: scheduled runs enabled
}

variable "scheduler_parallelism" {
  description = "Parallelism for scheduler job"
  type        = number
  default     = 1

  validation {
    condition     = var.scheduler_parallelism >= 1
    error_message = "scheduler_parallelism must be >= 1"
  }
}

# ============================================
# CONTAINER RESOURCE ALLOCATION
# ============================================

## API Resources
variable "api_cpu" {
  description = "CPU allocation for API container"
  type        = number
  default     = 0.25
}

variable "api_memory" {
  description = "Memory allocation for API container"
  type        = string
  default     = "0.5Gi"
}

## Worker Resources
variable "worker_cpu" {
  description = "CPU allocation for worker container (higher for Nivoda API workload)"
  type        = number
  default     = 0.5
}

variable "worker_memory" {
  description = "Memory allocation for worker container"
  type        = string
  default     = "1Gi"
}

variable "worker_message_count" {
  description = "Number of Service Bus messages per worker replica for KEDA scaling (lower = more parallelism, higher = fewer workers). Default 1 = one worker per message."
  type        = number
  default     = 1
}

## Consolidator Resources
variable "consolidator_cpu" {
  description = "CPU allocation for consolidator container (increased for batch operations)"
  type        = number
  default     = 0.5
}

variable "consolidator_memory" {
  description = "Memory allocation for consolidator container (increased for batch operations)"
  type        = string
  default     = "1Gi"
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

# ============================================
# SCALING CONFIGURATION
# ============================================

## API Scaling
variable "api_min_replicas" {
  description = "Minimum API replicas"
  type        = number
  default     = 1

  validation {
    condition     = var.api_min_replicas >= 0
    error_message = "api_min_replicas must be >= 0"
  }
}

variable "api_max_replicas" {
  description = "Maximum API replicas"
  type        = number
  default     = 5

  validation {
    condition     = var.api_max_replicas >= var.api_min_replicas
    error_message = "api_max_replicas must be >= api_min_replicas"
  }
}

## Worker Scaling
variable "worker_min_replicas" {
  description = "Minimum worker replicas"
  type        = number
  default     = 1

  validation {
    condition     = var.worker_min_replicas >= 0
    error_message = "worker_min_replicas must be >= 0"
  }
}

variable "worker_max_replicas" {
  description = "Maximum worker replicas"
  type        = number
  default     = 10

  validation {
    condition     = var.worker_max_replicas >= var.worker_min_replicas
    error_message = "worker_max_replicas must be >= worker_min_replicas"
  }
}

## Consolidator Scaling
variable "consolidator_min_replicas" {
  description = "Minimum consolidator replicas"
  type        = number
  default     = 1

  validation {
    condition     = var.consolidator_min_replicas >= 0
    error_message = "consolidator_min_replicas must be >= 0"
  }
}

variable "consolidator_max_replicas" {
  description = "Maximum consolidator replicas (safe with FOR UPDATE SKIP LOCKED, recommended <= 3)"
  type        = number
  default     = 3

  validation {
    condition     = var.consolidator_max_replicas >= var.consolidator_min_replicas && var.consolidator_max_replicas <= 5
    error_message = "consolidator_max_replicas must be >= consolidator_min_replicas and <= 5"
  }
}

## Dashboard Scaling
variable "dashboard_min_replicas" {
  description = "Minimum dashboard replicas"
  type        = number
  default     = 1

  validation {
    condition     = var.dashboard_min_replicas >= 0
    error_message = "dashboard_min_replicas must be >= 0"
  }
}

variable "dashboard_max_replicas" {
  description = "Maximum dashboard replicas"
  type        = number
  default     = 2

  validation {
    condition     = var.dashboard_max_replicas >= var.dashboard_min_replicas
    error_message = "dashboard_max_replicas must be >= dashboard_min_replicas"
  }
}

# ============================================
# OBSERVABILITY
# ============================================

variable "log_analytics_retention_days" {
  description = "Log Analytics workspace retention in days"
  type        = number
  default     = 30

  validation {
    condition     = var.log_analytics_retention_days >= 7 && var.log_analytics_retention_days <= 730
    error_message = "log_analytics_retention_days must be between 7 and 730 days"
  }
}
