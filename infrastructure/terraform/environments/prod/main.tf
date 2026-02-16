terraform {
  required_version = ">= 1.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "diamond-tfstate-rg"
    storage_account_name = "diamondtfstate"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "diamond-${var.environment}-rg"
  location = var.location

  tags = local.tags
}

locals {
  tags = {
    Environment = var.environment
    Project     = "diamond"
    ManagedBy   = "terraform"
  }
}

# Service Bus
module "service_bus" {
  source = "../../modules/service-bus"

  namespace_name      = "diamond-${var.environment}-servicebus"
  location            = var.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = var.servicebus_sku

  tags = local.tags
}

# Storage Account
module "storage" {
  source = "../../modules/storage"

  storage_account_name = "diamond${var.environment}store"
  location             = var.location
  resource_group_name  = azurerm_resource_group.main.name
  replication_type     = var.storage_replication_type
  enable_versioning    = var.storage_enable_versioning

  tags = local.tags
}

# Container Registry (shared across environments in prod, separate in prod)
module "container_registry" {
  source = "../../modules/container-registry"

  registry_name       = "diamond${var.environment}acr"
  location            = var.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = var.acr_sku

  tags = local.tags
}


# Container Apps (only create if enabled)
module "container_apps" {
  source = "../../modules/container-apps"
  count  = 1

  environment_name    = "diamond-${var.environment}-env"
  app_name_prefix     = "diamond-${var.environment}"
  location            = var.location
  resource_group_name = azurerm_resource_group.main.name
  subscription_id     = var.subscription_id

  # Image configuration
  image_tag       = var.image_tag
  environment_tag = var.environment_tag

  # Container Registry
  container_registry_login_server = module.container_registry.login_server
  container_registry_username     = module.container_registry.admin_username
  container_registry_password     = module.container_registry.admin_password

  # Connection strings (from modules)
  storage_connection_string    = module.storage.primary_connection_string
  servicebus_connection_string = module.service_bus.connection_string
  servicebus_namespace         = "diamond-${var.environment}-servicebus"

  # Database configuration (from variables)
  database_host     = var.database_host
  database_port     = var.database_port
  database_name     = var.database_name
  database_username = var.database_username
  database_password = var.database_password

  # External configuration (from variables)
  nivoda_endpoint  = var.nivoda_endpoint
  nivoda_username  = var.nivoda_username
  nivoda_password  = var.nivoda_password
  nivoda_proxy_base_url = var.nivoda_proxy_base_url
  internal_service_token = var.internal_service_token
  
  hmac_secrets     = var.hmac_secrets
  resend_api_key   = var.resend_api_key
  alert_email_to   = var.alert_email_to
  alert_email_from = var.alert_email_from

  # Scheduler configuration
  scheduler_cron_expression = var.scheduler_cron_expression
  enable_scheduler          = var.enable_scheduler

  # Worker scaling configuration
  worker_message_count = var.worker_message_count

  # Resource allocation - replicas
  api_min_replicas          = var.api_min_replicas
  api_max_replicas          = var.api_max_replicas
  worker_min_replicas       = var.worker_min_replicas
  worker_max_replicas       = var.worker_max_replicas
  consolidator_min_replicas = var.consolidator_min_replicas
  consolidator_max_replicas = var.consolidator_max_replicas

  # Resource allocation - CPU/memory (optimized for prod)
  api_cpu               = var.api_cpu
  api_memory            = var.api_memory
  worker_cpu            = var.worker_cpu
  worker_memory         = var.worker_memory
  consolidator_cpu      = var.consolidator_cpu
  consolidator_memory   = var.consolidator_memory
  scheduler_cpu         = var.scheduler_cpu
  scheduler_memory      = var.scheduler_memory
  scheduler_parallelism = var.scheduler_parallelism
  dashboard_cpu         = var.dashboard_cpu
  dashboard_memory      = var.dashboard_memory

  # Scaling - demo feed API
  demo_feed_api_min_replicas = var.demo_feed_api_min_replicas
  demo_feed_api_max_replicas = var.demo_feed_api_max_replicas

  # Scaling - dashboard
  dashboard_min_replicas = var.dashboard_min_replicas
  dashboard_max_replicas = var.dashboard_max_replicas

  # Scaling - storefront
  storefront_cpu          = var.storefront_cpu
  storefront_memory       = var.storefront_memory
  storefront_min_replicas = var.storefront_min_replicas
  storefront_max_replicas = var.storefront_max_replicas

  # Log Analytics (reduced retention for prod)
  log_analytics_retention_days = var.log_analytics_retention_days

  tags = local.tags
}
