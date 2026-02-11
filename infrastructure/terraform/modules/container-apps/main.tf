terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

# Log Analytics Workspace (required for Container Apps)
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.environment_name}-logs"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = "PerGB2018"
  # retention_in_days   = var.log_analytics_retention_days

  tags = var.tags
}

# Container Apps Environment
resource "azurerm_container_app_environment" "main" {
  name                       = var.environment_name
  location                   = var.location
  resource_group_name        = var.resource_group_name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  tags = var.tags
}

# API Container App (HTTP, external ingress)
resource "azurerm_container_app" "api" {
  name                         = "${var.app_name_prefix}-api"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = var.api_min_replicas
    max_replicas = var.api_max_replicas

    container {
      name   = "api"
      image  = "${var.container_registry_login_server}/diamond-api:${var.image_tag}"
      cpu    = var.api_cpu
      memory = var.api_memory

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name        = "DATABASE_HOST"
        secret_name = "database-host"
      }

      env {
        name        = "DATABASE_PORT"
        secret_name = "database-port"
      }

      env {
        name        = "DATABASE_NAME"
        secret_name = "database-name"
      }

      env {
        name        = "DATABASE_USERNAME"
        secret_name = "database-username"
      }

      env {
        name        = "DATABASE_PASSWORD"
        secret_name = "database-password"
      }

      env {
        name        = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "storage-connection-string"
      }

      env {
        name        = "AZURE_SERVICE_BUS_CONNECTION_STRING"
        secret_name = "servicebus-connection-string"
      }

      env {
        name        = "HMAC_SECRETS"
        secret_name = "hmac-secrets"
      }

      env {
        name        = "NIVODA_ENDPOINT"
        secret_name = "nivoda-endpoint"
      }

      env {
        name        = "NIVODA_USERNAME"
        secret_name = "nivoda-username"
      }

      env {
        name        = "NIVODA_PASSWORD"
        secret_name = "nivoda-password"
      }

      env {
<<<<<<< Updated upstream
        name        = "INTERNAL_SERVICE_TOKEN"
=======
        name  = "NIVODA_PROXY_BASE_URL"
        secret_name = "nivoda-proxy-base-url"
      }

      env {
        name  = "INTERNAL_SERVICE_TOKEN"
>>>>>>> Stashed changes
        secret_name = "internal-service-token"
      }

      # Environment variables for scheduler job trigger
      env {
        name  = "AZURE_SUBSCRIPTION_ID"
        value = var.subscription_id
      }

      env {
        name  = "AZURE_RESOURCE_GROUP"
        value = var.resource_group_name
      }

      env {
        name  = "AZURE_SCHEDULER_JOB_NAME"
        value = "${var.app_name_prefix}-scheduler"
      }

      env {
        name  = "CONTAINER_REGISTRY_SERVER"
        value = var.container_registry_login_server
      }

      env {
        name  = "IMAGE_TAG"
        value = var.environment_tag
      }

      # Demo feed API URL for seed proxy
      env {
        name  = "DEMO_FEED_API_URL"
        value = "https://${azurerm_container_app.demo_feed_api.ingress[0].fqdn}"
      }

      # Database pooling configuration
      env {
        name  = "PG_POOL_MAX"
        value = tostring(var.api_pg_pool_max)
      }

      env {
        name  = "PG_IDLE_TIMEOUT_MS"
        value = tostring(var.api_pg_idle_timeout_ms)
      }

      env {
        name  = "PG_CONN_TIMEOUT_MS"
        value = tostring(var.api_pg_conn_timeout_ms)
      }
    }
  }

  # Enable managed identity for Azure API calls
  identity {
    type = "SystemAssigned"
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  registry {
    server               = var.container_registry_login_server
    username             = var.container_registry_username
    password_secret_name = "registry-password"
  }

  secret {
    name  = "database-host"
    value = var.database_host
  }

  secret {
    name  = "database-port"
    value = var.database_port
  }

  secret {
    name  = "database-name"
    value = var.database_name
  }

  secret {
    name  = "database-username"
    value = var.database_username
  }

  secret {
    name  = "database-password"
    value = var.database_password
  }

  secret {
    name  = "storage-connection-string"
    value = var.storage_connection_string
  }

  secret {
    name  = "servicebus-connection-string"
    value = var.servicebus_connection_string
  }

  secret {
    name  = "hmac-secrets"
    value = var.hmac_secrets
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
  }

  secret {
    name  = "nivoda-endpoint"
    value = var.nivoda_endpoint
  }

  secret {
    name  = "nivoda-username"
    value = var.nivoda_username
  }

  secret {
    name  = "nivoda-password"
    value = var.nivoda_password
  }

  secret {
<<<<<<< Updated upstream
    name  = "internal-service-token"
    value = coalesce(var.internal_service_token, "not-configured")
=======
    name  = "nivoda-proxy-base-url"
    value = var.nivoda_proxy_base_url
  }

  secret {
    name  = "internal-service-token"
    value = var.internal_service_token
>>>>>>> Stashed changes
  }

  tags = var.tags
}

# Worker Container App (Service Bus consumer, long-running)
resource "azurerm_container_app" "worker" {
  name                         = "${var.app_name_prefix}-worker"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = var.worker_min_replicas
    max_replicas = var.worker_max_replicas

    custom_scale_rule {
      name             = "servicebus-work-items-scale"
      custom_rule_type = "azure-servicebus"
      metadata = {
        namespace              = var.servicebus_namespace
        queueName              = "work-items"
        messageCount           = tostring(var.worker_message_count)
        activationMessageCount = "0"
      }
      authentication {
        secret_name       = "servicebus-connection-string"
        trigger_parameter = "connection"
      }
    }

    container {
      name   = "worker"
      image  = "${var.container_registry_login_server}/diamond-worker:${var.image_tag}"
      cpu    = var.worker_cpu
      memory = var.worker_memory

      env {
        name        = "DATABASE_HOST"
        secret_name = "database-host"
      }

      env {
        name        = "DATABASE_PORT"
        secret_name = "database-port"
      }

      env {
        name        = "DATABASE_NAME"
        secret_name = "database-name"
      }

      env {
        name        = "DATABASE_USERNAME"
        secret_name = "database-username"
      }

      env {
        name        = "DATABASE_PASSWORD"
        secret_name = "database-password"
      }

      env {
        name        = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "storage-connection-string"
      }

      env {
        name        = "AZURE_SERVICE_BUS_CONNECTION_STRING"
        secret_name = "servicebus-connection-string"
      }

      env {
        name        = "NIVODA_ENDPOINT"
        secret_name = "nivoda-endpoint"
      }

      env {
        name        = "NIVODA_USERNAME"
        secret_name = "nivoda-username"
      }

      env {
        name        = "NIVODA_PASSWORD"
        secret_name = "nivoda-password"
      }

      env {
        name  = "NIVODA_PROXY_BASE_URL"
        secret_name = "nivoda-proxy-base-url"
      }

      env {
<<<<<<< Updated upstream
        name        = "INTERNAL_SERVICE_TOKEN"
=======
        name  = "INTERNAL_SERVICE_TOKEN"
>>>>>>> Stashed changes
        secret_name = "internal-service-token"
      }

      # Email alerts for run completion/failure notifications
      env {
        name        = "RESEND_API_KEY"
        secret_name = "resend-api-key"
      }

      env {
        name  = "ALERT_EMAIL_TO"
        value = var.alert_email_to
      }

      env {
        name  = "ALERT_EMAIL_FROM"
        value = var.alert_email_from
      }

      # Demo feed API URL for DemoFeedAdapter
      env {
        name  = "DEMO_FEED_API_URL"
        value = "https://${azurerm_container_app.demo_feed_api.ingress[0].fqdn}"
      }

      # Database pooling configuration - keep low for high replica count scaling
      env {
        name  = "PG_POOL_MAX"
        value = tostring(var.worker_pg_pool_max)
      }

      env {
        name  = "PG_IDLE_TIMEOUT_MS"
        value = tostring(var.worker_pg_idle_timeout_ms)
      }

      env {
        name  = "PG_CONN_TIMEOUT_MS"
        value = tostring(var.worker_pg_conn_timeout_ms)
      }
    }
  }

  registry {
    server               = var.container_registry_login_server
    username             = var.container_registry_username
    password_secret_name = "registry-password"
  }

  secret {
    name  = "database-host"
    value = var.database_host
  }

  secret {
    name  = "database-port"
    value = var.database_port
  }

  secret {
    name  = "database-name"
    value = var.database_name
  }

  secret {
    name  = "database-username"
    value = var.database_username
  }

  secret {
    name  = "database-password"
    value = var.database_password
  }

  secret {
    name  = "storage-connection-string"
    value = var.storage_connection_string
  }

  secret {
    name  = "servicebus-connection-string"
    value = var.servicebus_connection_string
  }

  secret {
    name  = "nivoda-endpoint"
    value = var.nivoda_endpoint
  }

  secret {
    name  = "nivoda-username"
    value = var.nivoda_username
  }

  secret {
    name  = "nivoda-password"
    value = var.nivoda_password
  }

  secret {
    name  = "resend-api-key"
    value = var.resend_api_key
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
  }

  secret {
<<<<<<< Updated upstream
    name  = "internal-service-token"
    value = coalesce(var.internal_service_token, "not-configured")
=======
    name  = "nivoda-proxy-base-url"
    value = var.nivoda_proxy_base_url
  }

  secret {
    name  = "internal-service-token"
    value = var.internal_service_token
>>>>>>> Stashed changes
  }

  tags = var.tags
}

# Consolidator Container App (Service Bus consumer, long-running)
# Now supports multi-replica deployment with FOR UPDATE SKIP LOCKED
resource "azurerm_container_app" "consolidator" {
  name                         = "${var.app_name_prefix}-consolidator"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = var.consolidator_min_replicas
    max_replicas = var.consolidator_max_replicas

    # Scale based on consolidate queue depth - enables parallel processing
    custom_scale_rule {
      name             = "servicebus-consolidate-scale"
      custom_rule_type = "azure-servicebus"
      metadata = {
        namespace              = var.servicebus_namespace
        queueName              = "consolidate"
        messageCount           = "1"
        activationMessageCount = "0"
      }
      authentication {
        secret_name       = "servicebus-connection-string"
        trigger_parameter = "connection"
      }
    }

    container {
      name   = "consolidator"
      image  = "${var.container_registry_login_server}/diamond-consolidator:${var.image_tag}"
      cpu    = var.consolidator_cpu
      memory = var.consolidator_memory

      env {
        name        = "DATABASE_HOST"
        secret_name = "database-host"
      }

      env {
        name        = "DATABASE_PORT"
        secret_name = "database-port"
      }

      env {
        name        = "DATABASE_NAME"
        secret_name = "database-name"
      }

      env {
        name        = "DATABASE_USERNAME"
        secret_name = "database-username"
      }

      env {
        name        = "DATABASE_PASSWORD"
        secret_name = "database-password"
      }

      env {
        name        = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "storage-connection-string"
      }

      env {
        name        = "AZURE_SERVICE_BUS_CONNECTION_STRING"
        secret_name = "servicebus-connection-string"
      }

      env {
        name        = "RESEND_API_KEY"
        secret_name = "resend-api-key"
      }

      env {
        name  = "ALERT_EMAIL_TO"
        value = var.alert_email_to
      }

      env {
        name  = "ALERT_EMAIL_FROM"
        value = var.alert_email_from
      }

      # Database pooling configuration for multi-replica consolidation
      env {
        name  = "PG_POOL_MAX"
        value = tostring(var.consolidator_pg_pool_max)
      }

      env {
        name  = "PG_IDLE_TIMEOUT_MS"
        value = tostring(var.consolidator_pg_idle_timeout_ms)
      }

      env {
        name  = "PG_CONN_TIMEOUT_MS"
        value = tostring(var.consolidator_pg_conn_timeout_ms)
      }

      # Concurrent batch operations - should not exceed PG_POOL_MAX
      env {
        name  = "CONSOLIDATOR_CONCURRENCY"
        value = tostring(var.consolidator_concurrency)
      }
    }
  }

  registry {
    server               = var.container_registry_login_server
    username             = var.container_registry_username
    password_secret_name = "registry-password"
  }

  secret {
    name  = "database-host"
    value = var.database_host
  }

  secret {
    name  = "database-port"
    value = var.database_port
  }

  secret {
    name  = "database-name"
    value = var.database_name
  }

  secret {
    name  = "database-username"
    value = var.database_username
  }

  secret {
    name  = "database-password"
    value = var.database_password
  }

  secret {
    name  = "storage-connection-string"
    value = var.storage_connection_string
  }

  secret {
    name  = "servicebus-connection-string"
    value = var.servicebus_connection_string
  }

  secret {
    name  = "resend-api-key"
    value = var.resend_api_key
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
  }

  tags = var.tags
}

# Scheduler as a Container Apps Job (runs on-demand or scheduled)
# Set enable_scheduler = false to disable the cron schedule (manual trigger only)
resource "azurerm_container_app_job" "scheduler" {
  count = var.enable_scheduler ? 1 : 0

  name                         = "${var.app_name_prefix}-scheduler"
  location                     = var.location
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name

  # trigger_type               = "Schedule"
  replica_timeout_in_seconds = 1800
  replica_retry_limit        = 1

  # Schedule-based trigger (runs daily at 2 AM UTC)
  schedule_trigger_config {
    cron_expression          = var.scheduler_cron_expression
    parallelism              = var.scheduler_parallelism
    replica_completion_count = 1
  }

  template {
    container {
      name   = "scheduler"
      image  = "${var.container_registry_login_server}/diamond-scheduler:${var.image_tag}"
      cpu    = var.scheduler_cpu
      memory = var.scheduler_memory

      env {
        name        = "DATABASE_HOST"
        secret_name = "database-host"
      }

      env {
        name        = "DATABASE_PORT"
        secret_name = "database-port"
      }

      env {
        name        = "DATABASE_NAME"
        secret_name = "database-name"
      }

      env {
        name        = "DATABASE_USERNAME"
        secret_name = "database-username"
      }

      env {
        name        = "DATABASE_PASSWORD"
        secret_name = "database-password"
      }

      env {
        name        = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "storage-connection-string"
      }

      env {
        name        = "AZURE_SERVICE_BUS_CONNECTION_STRING"
        secret_name = "servicebus-connection-string"
      }

      env {
        name        = "NIVODA_ENDPOINT"
        secret_name = "nivoda-endpoint"
      }

      env {
        name        = "NIVODA_USERNAME"
        secret_name = "nivoda-username"
      }

      env {
        name        = "NIVODA_PASSWORD"
        secret_name = "nivoda-password"
      }
      
      env {
        name  = "NIVODA_PROXY_BASE_URL"
        secret_name = "nivoda-proxy-base-url"
      }

      env {
<<<<<<< Updated upstream
        name        = "INTERNAL_SERVICE_TOKEN"
=======
        name  = "INTERNAL_SERVICE_TOKEN"
>>>>>>> Stashed changes
        secret_name = "internal-service-token"
      }

      # Demo feed API URL for DemoFeedAdapter
      env {
        name  = "DEMO_FEED_API_URL"
        value = "https://${azurerm_container_app.demo_feed_api.ingress[0].fqdn}"
      }

      # Database pooling configuration
      env {
        name  = "PG_POOL_MAX"
        value = tostring(var.scheduler_pg_pool_max)
      }

      env {
        name  = "PG_IDLE_TIMEOUT_MS"
        value = tostring(var.scheduler_pg_idle_timeout_ms)
      }

      env {
        name  = "PG_CONN_TIMEOUT_MS"
        value = tostring(var.scheduler_pg_conn_timeout_ms)
      }
    }
  }

  registry {
    server               = var.container_registry_login_server
    username             = var.container_registry_username
    password_secret_name = "registry-password"
  }

  secret {
    name  = "database-host"
    value = var.database_host
  }

  secret {
    name  = "database-port"
    value = var.database_port
  }

  secret {
    name  = "database-name"
    value = var.database_name
  }

  secret {
    name  = "database-username"
    value = var.database_username
  }

  secret {
    name  = "database-password"
    value = var.database_password
  }

  secret {
    name  = "storage-connection-string"
    value = var.storage_connection_string
  }

  secret {
    name  = "servicebus-connection-string"
    value = var.servicebus_connection_string
  }

  secret {
    name  = "nivoda-endpoint"
    value = var.nivoda_endpoint
  }

  secret {
    name  = "nivoda-username"
    value = var.nivoda_username
  }

  secret {
    name  = "nivoda-password"
    value = var.nivoda_password
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
  }

  secret {
<<<<<<< Updated upstream
    name  = "internal-service-token"
    value = coalesce(var.internal_service_token, "not-configured")
=======
    name  = "nivoda-proxy-base-url"
    value = var.nivoda_proxy_base_url
  }

  secret {
    name  = "internal-service-token"
    value = var.internal_service_token
>>>>>>> Stashed changes
  }

  tags = var.tags
}

# Demo Feed API Container App (HTTP, internal ingress - serves mock diamond data)
resource "azurerm_container_app" "demo_feed_api" {
  name                         = "${var.app_name_prefix}-demo-feed-api"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = var.demo_feed_api_min_replicas
    max_replicas = var.demo_feed_api_max_replicas

    container {
      name   = "demo-feed-api"
      image  = "${var.container_registry_login_server}/diamond-demo-feed-api:${var.image_tag}"
      cpu    = var.demo_feed_api_cpu
      memory = var.demo_feed_api_memory

      env {
        name  = "DEMO_FEED_API_PORT"
        value = "4000"
      }

      env {
        name        = "DATABASE_HOST"
        secret_name = "database-host"
      }

      env {
        name        = "DATABASE_PORT"
        secret_name = "database-port"
      }

      env {
        name        = "DATABASE_NAME"
        secret_name = "database-name"
      }

      env {
        name        = "DATABASE_USERNAME"
        secret_name = "database-username"
      }

      env {
        name        = "DATABASE_PASSWORD"
        secret_name = "database-password"
      }

      env {
        name  = "PG_POOL_MAX"
        value = "2"
      }

      env {
        name  = "PG_IDLE_TIMEOUT_MS"
        value = "30000"
      }

      env {
        name  = "PG_CONN_TIMEOUT_MS"
        value = "5000"
      }
    }
  }

  ingress {
    external_enabled = false
    target_port      = 4000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  registry {
    server               = var.container_registry_login_server
    username             = var.container_registry_username
    password_secret_name = "registry-password"
  }

  secret {
    name  = "database-host"
    value = var.database_host
  }

  secret {
    name  = "database-port"
    value = var.database_port
  }

  secret {
    name  = "database-name"
    value = var.database_name
  }

  secret {
    name  = "database-username"
    value = var.database_username
  }

  secret {
    name  = "database-password"
    value = var.database_password
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
  }

  tags = var.tags
}

# Dashboard Container App (HTTP, external ingress)
resource "azurerm_container_app" "dashboard" {
  name                         = "${var.app_name_prefix}-dashboard"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = var.dashboard_min_replicas
    max_replicas = var.dashboard_max_replicas

    container {
      name   = "dashboard"
      image  = "${var.container_registry_login_server}/diamond-dashboard:${var.image_tag}"
      cpu    = var.dashboard_cpu
      memory = var.dashboard_memory

      env {
        name  = "API_URL"
        value = "https://${azurerm_container_app.api.ingress[0].fqdn}"
      }

      env {
        name        = "NIVODA_ENDPOINT"
        secret_name = "nivoda-endpoint"
      }

      env {
        name        = "NIVODA_USERNAME"
        secret_name = "nivoda-username"
      }

      env {
        name        = "NIVODA_PASSWORD"
        secret_name = "nivoda-password"
      }

      env {
        name  = "NIVODA_PROXY_BASE_URL"
        secret_name = "nivoda-proxy-base-url"
      }

      env {
        name  = "INTERNAL_SERVICE_TOKEN"
        secret_name = "internal-service-token"
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 80
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  registry {
    server               = var.container_registry_login_server
    username             = var.container_registry_username
    password_secret_name = "registry-password"
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
  }

  secret {
    name  = "nivoda-endpoint"
    value = var.nivoda_endpoint
  }

  secret {
    name  = "nivoda-username"
    value = var.nivoda_username
  }

  secret {
    name  = "nivoda-password"
    value = var.nivoda_password
  }

  secret {
    name  = "nivoda-proxy-base-url"
    value = var.nivoda_proxy_base_url
  }

  secret {
    name  = "internal-service-token"
    value = var.internal_service_token
  }
  

  tags = var.tags

  depends_on = [azurerm_container_app.api]
}

# Grant API managed identity permission to trigger the scheduler job
resource "azurerm_role_assignment" "api_scheduler_job_operator" {
  count = var.enable_scheduler ? 1 : 0

  scope                = azurerm_container_app_job.scheduler[0].id
  role_definition_name = "Container Apps Jobs Operator"
  principal_id         = azurerm_container_app.api.identity[0].principal_id
}
