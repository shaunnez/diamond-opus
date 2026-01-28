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
}

variable "database_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "nivoda_endpoint" {
  description = "Nivoda API endpoint"
  type        = string
}

variable "nivoda_username" {
  description = "Nivoda API username"
  type        = string
  sensitive   = true
}

variable "nivoda_password" {
  description = "Nivoda API password"
  type        = string
  sensitive   = true
}

variable "hmac_secrets" {
  description = "JSON object of HMAC secrets"
  type        = string
  sensitive   = true
}

variable "resend_api_key" {
  description = "Resend API key for alerts"
  type        = string
  sensitive   = true
}

variable "alert_email_to" {
  description = "Email address for alerts"
  type        = string
}

variable "alert_email_from" {
  description = "Email address for sending alerts"
  type        = string
}

# Scheduler
variable "scheduler_cron_expression" {
  description = "Cron expression for scheduler"
  type        = string
  default     = "0 2 * * *"
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
