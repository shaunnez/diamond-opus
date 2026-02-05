variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "staging"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "australiaeast"
}


variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "staging"
}

variable "environment_tag" {
  description = "Environment-specific docker tag for scheduler job"
  type        = string
  default     = "staging"
}

# SKU configurations
variable "servicebus_sku" {
  description = "Service Bus SKU (Basic for staging, Standard for prod)"
  type        = string
  default     = "Basic"
}

variable "storage_replication_type" {
  description = "Storage replication type"
  type        = string
  default     = "LRS"
}

variable "acr_sku" {
  description = "Container Registry SKU"
  type        = string
  default     = "Basic"
}

# Database configuration (Supabase)
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

variable "nivoda_endpoint" {
  description = "Nivoda API endpoint"
  type        = string
  default     = "https://intg-customer-staging.nivodaapi.net/api/diamonds"
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

variable "hmac_secrets" {
  description = "JSON object of HMAC secrets"
  type        = string
  sensitive   = true
  default     = "{}"
}

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

# Scheduler
variable "scheduler_cron_expression" {
  description = "Cron expression for scheduler (use '0 0 31 2 *' to effectively disable)"
  type        = string
  default     = "0 0 31 2 *"  # Feb 31st = never runs, but job exists for manual triggers
}

variable "enable_scheduler" {
  description = "Whether to create the scheduler job resource"
  type        = bool
  default     = true
}

# Worker scaling configuration
variable "worker_message_count" {
  description = "Number of Service Bus messages per worker replica for KEDA scaling"
  type        = number
  default     = 1
}

# Scaling configuration
variable "api_min_replicas" {
  description = "Minimum API replicas"
  type        = number
  default     = 0
}

variable "api_max_replicas" {
  description = "Maximum API replicas"
  type        = number
  default     = 2
}

variable "worker_min_replicas" {
  description = "Minimum worker replicas"
  type        = number
  default     = 0
}

variable "worker_max_replicas" {
  description = "Maximum worker replicas"
  type        = number
  default     = 3
}

variable "consolidator_min_replicas" {
  description = "Minimum consolidator replicas"
  type        = number
  default     = 0
}

variable "consolidator_max_replicas" {
  description = "Maximum consolidator replicas (safe with FOR UPDATE SKIP LOCKED)"
  type        = number
  default     = 2
}

# Log Analytics configuration
variable "log_analytics_retention_days" {
  description = "Log Analytics workspace retention in days (7 for staging to reduce costs)"
  type        = number
  default     = 7
}

# Container resource allocation (optimized for cost in staging)
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

variable "worker_cpu" {
  description = "CPU allocation for worker container"
  type        = number
  default     = 0.5
}

variable "worker_memory" {
  description = "Memory allocation for worker container"
  type        = string
  default     = "1Gi"
}

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

variable "scheduler_parallelism" {
  type    = number
  default = 1
  validation {
    condition     = var.scheduler_parallelism >= 1
    error_message = "scheduler_parallelism must be >= 1"
  }
}
