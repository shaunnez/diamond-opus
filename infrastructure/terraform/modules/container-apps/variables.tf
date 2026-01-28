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

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

# Container Registry
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
}

# Database connection
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

variable "storage_connection_string" {
  description = "Azure Storage connection string"
  type        = string
  sensitive   = true
}

variable "servicebus_connection_string" {
  description = "Azure Service Bus connection string"
  type        = string
  sensitive   = true
}

variable "servicebus_namespace" {
  description = "Azure Service Bus namespace name for scale rules"
  type        = string
}

# Nivoda API credentials
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

# API configuration
variable "hmac_secrets" {
  description = "JSON object of HMAC secrets for API authentication"
  type        = string
  sensitive   = true
  default     = "{}"
}

# Alerting
variable "resend_api_key" {
  description = "Resend API key for email alerts"
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

# Scheduler configuration
variable "scheduler_cron_expression" {
  description = "Cron expression for scheduler job (e.g., '0 2 * * *' for 2 AM daily)"
  type        = string
  default     = "0 2 * * *"
}

# Resource allocation - API
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

variable "api_min_replicas" {
  description = "Minimum replicas for API"
  type        = number
  default     = 1
}

variable "api_max_replicas" {
  description = "Maximum replicas for API"
  type        = number
  default     = 3
}

# Resource allocation - Worker
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

variable "worker_min_replicas" {
  description = "Minimum replicas for worker"
  type        = number
  default     = 1
}

variable "worker_max_replicas" {
  description = "Maximum replicas for worker"
  type        = number
  default     = 5
}

# Resource allocation - Consolidator
# Increased for batch operations (100 diamonds per upsert, 5 concurrent batches)
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

# Resource allocation - Scheduler
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

# Resource allocation - Dashboard
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

# Log Analytics configuration
variable "log_analytics_retention_days" {
  description = "Log Analytics workspace retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "scheduler_parallelism" {
  type    = number
  default = 1
  validation {
    condition     = var.scheduler_parallelism >= 1
    error_message = "scheduler_parallelism must be >= 1"
  }
}
