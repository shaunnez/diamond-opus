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

# Feature flags
variable "enable_container_apps" {
  description = "Enable Container Apps deployment"
  type        = bool
  default     = false
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

# SKU configurations
variable "servicebus_sku" {
  description = "Service Bus SKU"
  type        = string
  default     = "Standard"
}

variable "storage_replication_type" {
  description = "Storage replication type (ZRS for cost-optimized zone redundancy)"
  type        = string
  default     = "ZRS"
}

variable "acr_sku" {
  description = "Container Registry SKU (Basic is sufficient for most workloads)"
  type        = string
  default     = "Basic"
}

# Database configuration (Supabase)
variable "database_host" {
  description = "PostgreSQL host (e.g., db.supabase.co)"
  type        = string
  default     = ""
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
  default     = ""
}

variable "database_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "nivoda_endpoint" {
  description = "Nivoda API endpoint"
  type        = string
  default     = "https://integrations.nivoda.net/api/diamonds"
}

variable "nivoda_username" {
  description = "Nivoda API username"
  type        = string
  sensitive   = true
  default     = ""
}

variable "nivoda_password" {
  description = "Nivoda API password"
  type        = string
  sensitive   = true
  default     = ""
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
  default     = ""
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
  description = "Cron expression for scheduler"
  type        = string
  default     = "0 2 * * *"
}

# Scaling configuration (production-ready)
variable "api_min_replicas" {
  description = "Minimum API replicas"
  type        = number
  default     = 1
}

variable "api_max_replicas" {
  description = "Maximum API replicas"
  type        = number
  default     = 5
}

variable "worker_min_replicas" {
  description = "Minimum worker replicas"
  type        = number
  default     = 1
}

variable "worker_max_replicas" {
  description = "Maximum worker replicas"
  type        = number
  default     = 10
}

variable "consolidator_min_replicas" {
  description = "Minimum consolidator replicas"
  type        = number
  default     = 1
}

variable "consolidator_max_replicas" {
  description = "Maximum consolidator replicas"
  type        = number
  default     = 2
}

# Log Analytics configuration
variable "log_analytics_retention_days" {
  description = "Log Analytics workspace retention in days"
  type        = number
  default     = 30
}

# Container resource allocation (production values)
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
  description = "CPU allocation for worker container (higher for Nivoda API workload)"
  type        = number
  default     = 0.5
}

variable "worker_memory" {
  description = "Memory allocation for worker container"
  type        = string
  default     = "1Gi"
}

variable "consolidator_cpu" {
  description = "CPU allocation for consolidator container"
  type        = number
  default     = 0.25
}

variable "consolidator_memory" {
  description = "Memory allocation for consolidator container"
  type        = string
  default     = "0.5Gi"
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
