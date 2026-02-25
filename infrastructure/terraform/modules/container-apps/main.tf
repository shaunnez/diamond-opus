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
        name  = "SERVICE_NAME"
        value = "api"
      }

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
        name        = "INTERNAL_SERVICE_TOKEN"
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
        name  = "AZURE_SCHEDULER_JOB_NAME_PREFIX"
        value = "${var.app_name_prefix}-s-"
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

      # Nivoda proxy rate limiting and timeout
      env {
        name  = "NIVODA_PROXY_RATE_LIMIT"
        value = tostring(var.nivoda_proxy_rate_limit)
      }

      env {
        name  = "NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS"
        value = tostring(var.nivoda_proxy_rate_limit_max_wait_ms)
      }

      env {
        name  = "NIVODA_PROXY_TIMEOUT_MS"
        value = tostring(var.nivoda_proxy_timeout_ms)
      }

      env {
        name  = "NIVODA_PROXY_BASE_URL"
        value = var.nivoda_proxy_base_url != "" ? var.nivoda_proxy_base_url : "https://${azurerm_container_app.ingestion_proxy.ingress[0].fqdn}"
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

      # Search cache configuration
      env {
        name  = "CACHE_MAX_ENTRIES"
        value = tostring(var.api_cache_max_entries)
      }

      env {
        name  = "CACHE_TTL_MS"
        value = tostring(var.api_cache_ttl_ms)
      }

      env {
        name  = "CACHE_VERSION_POLL_INTERVAL_MS"
        value = tostring(var.api_cache_version_poll_interval_ms)
      }

      # Slack notifications
      env {
        name        = "SLACK_WEBHOOK_ERRORS"
        secret_name = "slack-webhook-errors"
      }

      env {
        name        = "SLACK_WEBHOOK_PIPELINE"
        secret_name = "slack-webhook-pipeline"
      }

      env {
        name        = "SLACK_WEBHOOK_OPS"
        secret_name = "slack-webhook-ops"
      }

      # Stripe payments
      env {
        name        = "STRIPE_SECRET_KEY"
        secret_name = "stripe-secret-key"
      }

      env {
        name        = "STRIPE_WEBHOOK_SECRET"
        secret_name = "stripe-webhook-secret"
      }

      env {
        name  = "STOREFRONT_URL"
        value = "https://${var.app_name_prefix}-storefront.${azurerm_container_app_environment.main.default_domain}"
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
    name  = "internal-service-token"
    value = coalesce(var.internal_service_token, "not-configured")
  }

  secret {
    name  = "slack-webhook-errors"
    value = coalesce(var.slack_webhook_errors, "not-configured")
  }

  secret {
    name  = "slack-webhook-pipeline"
    value = coalesce(var.slack_webhook_pipeline, "not-configured")
  }

  secret {
    name  = "slack-webhook-ops"
    value = coalesce(var.slack_webhook_ops, "not-configured")
  }

  secret {
    name  = "stripe-secret-key"
    value = coalesce(var.stripe_secret_key, "not-configured")
  }

  secret {
    name  = "stripe-webhook-secret"
    value = coalesce(var.stripe_webhook_secret, "not-configured")
  }

  tags = var.tags
}

# Ingestion Proxy Container App (single replica for global rate limit enforcement)
# Internal ingress only - scheduler and worker route Nivoda calls through this proxy
resource "azurerm_container_app" "ingestion_proxy" {
  name                         = "${var.app_name_prefix}-ingestion-proxy"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    # CRITICAL: Single replica enforcement for global rate limit
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "ingestion-proxy"
      image  = "${var.container_registry_login_server}/diamond-ingestion-proxy:${var.image_tag}"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "SERVICE_NAME"
        value = "ingestion-proxy"
      }

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
        name        = "INTERNAL_SERVICE_TOKEN"
        secret_name = "internal-service-token"
      }

      env {
        name  = "NIVODA_PROXY_RATE_LIMIT"
        value = tostring(var.nivoda_proxy_rate_limit)
      }

      env {
        name  = "NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS"
        value = tostring(var.nivoda_proxy_rate_limit_max_wait_ms)
      }

      env {
        name  = "NIVODA_PROXY_TIMEOUT_MS"
        value = tostring(var.nivoda_proxy_timeout_ms)
      }

      # TCP health probes - minimal configuration
      # Note: Azure Container Apps provider v3.x has limited probe attributes
      liveness_probe {
        transport = "TCP"
        port      = 3000
      }

      readiness_probe {
        transport = "TCP"
        port      = 3000
      }
    }
  }

  # External ingress - allows custom domain (stones.fourwords.co.nz) binding
  # Workers/scheduler use the internal FQDN when no override is set; this enables custom domain access
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
    name  = "internal-service-token"
    value = coalesce(var.internal_service_token, "not-configured")
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
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
        name  = "SERVICE_NAME"
        value = "worker"
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

      # Route Nivoda calls through ingestion proxy for global rate limit enforcement
      env {
        name  = "NIVODA_PROXY_BASE_URL"
        value = var.nivoda_proxy_base_url != "" ? var.nivoda_proxy_base_url : "https://${azurerm_container_app.ingestion_proxy.ingress[0].fqdn}"
      }

      env {
        name        = "INTERNAL_SERVICE_TOKEN"
        secret_name = "internal-service-token"
      }

      # Slack notifications
      env {
        name        = "SLACK_WEBHOOK_ERRORS"
        secret_name = "slack-webhook-errors"
      }

      env {
        name        = "SLACK_WEBHOOK_PIPELINE"
        secret_name = "slack-webhook-pipeline"
      }

      env {
        name        = "SLACK_WEBHOOK_OPS"
        secret_name = "slack-webhook-ops"
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
    name  = "slack-webhook-errors"
    value = coalesce(var.slack_webhook_errors, "not-configured")
  }

  secret {
    name  = "slack-webhook-pipeline"
    value = coalesce(var.slack_webhook_pipeline, "not-configured")
  }

  secret {
    name  = "slack-webhook-ops"
    value = coalesce(var.slack_webhook_ops, "not-configured")
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
  }

  secret {
    name  = "internal-service-token"
    value = coalesce(var.internal_service_token, "not-configured")
  }

  tags = var.tags
}

# User-assigned managed identity for the consolidator.
# A separate resource ensures principal_id is known at plan time, before the
# Container App is created/updated — avoiding the "null principal_id" Terraform
# error that occurs when adding a SystemAssigned identity to an existing resource.
resource "azurerm_user_assigned_identity" "consolidator" {
  name                = "${var.app_name_prefix}-consolidator-identity"
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

# Consolidator Container App (Service Bus consumer, long-running)
# Now supports multi-replica deployment with FOR UPDATE SKIP LOCKED
resource "azurerm_container_app" "consolidator" {
  name                         = "${var.app_name_prefix}-consolidator"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.consolidator.id]
  }

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
        name  = "SERVICE_NAME"
        value = "consolidator"
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

      # Slack notifications
      env {
        name        = "SLACK_WEBHOOK_ERRORS"
        secret_name = "slack-webhook-errors"
      }

      env {
        name        = "SLACK_WEBHOOK_PIPELINE"
        secret_name = "slack-webhook-pipeline"
      }

      env {
        name        = "SLACK_WEBHOOK_OPS"
        secret_name = "slack-webhook-ops"
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

      # Chain trigger: allow consolidator to start the next feed's scheduler job
      env {
        name  = "AZURE_SUBSCRIPTION_ID"
        value = var.subscription_id
      }

      env {
        name  = "AZURE_RESOURCE_GROUP"
        value = var.resource_group_name
      }

      env {
        name  = "AZURE_SCHEDULER_JOB_NAME_PREFIX"
        value = "${var.app_name_prefix}-s-"
      }

      env {
        name  = "FEED_CHAIN"
        value = jsonencode({ "nivoda-natural" = "nivoda-labgrown" })
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
    name  = "slack-webhook-errors"
    value = coalesce(var.slack_webhook_errors, "not-configured")
  }

  secret {
    name  = "slack-webhook-pipeline"
    value = coalesce(var.slack_webhook_pipeline, "not-configured")
  }

  secret {
    name  = "slack-webhook-ops"
    value = coalesce(var.slack_webhook_ops, "not-configured")
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
  }

  tags = var.tags
}

# Scheduler as Container Apps Jobs (one per feed, runs on-demand or scheduled)
# Set enable_scheduler = false to disable all cron schedules (manual trigger only)
resource "azurerm_container_app_job" "scheduler" {
  for_each = var.enable_scheduler ? var.scheduler_feeds : {}

  name                         = "${var.app_name_prefix}-s-${each.key}"
  location                     = var.location
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name

  replica_timeout_in_seconds = 1800
  replica_retry_limit        = 1

  dynamic "schedule_trigger_config" {
    for_each = each.value.cron_expression != null ? [1] : []
    content {
      cron_expression          = each.value.cron_expression
      parallelism              = var.scheduler_parallelism
      replica_completion_count = 1
    }
  }

  dynamic "manual_trigger_config" {
    for_each = each.value.cron_expression == null ? [1] : []
    content {
      parallelism              = var.scheduler_parallelism
      replica_completion_count = 1
    }
  }

  template {
    container {
      name   = "scheduler"
      image  = "${var.container_registry_login_server}/diamond-scheduler:${var.image_tag}"
      cpu    = var.scheduler_cpu
      memory = var.scheduler_memory

      env {
        name  = "SERVICE_NAME"
        value = "scheduler"
      }

      env {
        name  = "FEED"
        value = each.value.feed
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

      # Route Nivoda calls through ingestion proxy for global rate limit enforcement
      env {
        name  = "NIVODA_PROXY_BASE_URL"
        value = var.nivoda_proxy_base_url != "" ? var.nivoda_proxy_base_url : "https://${azurerm_container_app.ingestion_proxy.ingress[0].fqdn}"
      }

      env {
        name        = "INTERNAL_SERVICE_TOKEN"
        secret_name = "internal-service-token"
      }

      # Demo feed API URL for DemoFeedAdapter
      env {
        name  = "DEMO_FEED_API_URL"
        value = "https://${azurerm_container_app.demo_feed_api.ingress[0].fqdn}"
      }

      # Slack notifications
      env {
        name        = "SLACK_WEBHOOK_ERRORS"
        secret_name = "slack-webhook-errors"
      }

      env {
        name        = "SLACK_WEBHOOK_PIPELINE"
        secret_name = "slack-webhook-pipeline"
      }

      env {
        name        = "SLACK_WEBHOOK_OPS"
        secret_name = "slack-webhook-ops"
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
    name  = "internal-service-token"
    value = coalesce(var.internal_service_token, "not-configured")
  }

  secret {
    name  = "slack-webhook-errors"
    value = coalesce(var.slack_webhook_errors, "not-configured")
  }

  secret {
    name  = "slack-webhook-pipeline"
    value = coalesce(var.slack_webhook_pipeline, "not-configured")
  }

  secret {
    name  = "slack-webhook-ops"
    value = coalesce(var.slack_webhook_ops, "not-configured")
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
        name  = "SERVICE_NAME"
        value = "demo-feed-api"
      }

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

  tags = var.tags

  depends_on = [azurerm_container_app.api]
}

# Storefront Container App (HTTP, external ingress)
resource "azurerm_container_app" "storefront" {
  name                         = "${var.app_name_prefix}-storefront"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = var.storefront_min_replicas
    max_replicas = var.storefront_max_replicas

    container {
      name   = "storefront"
      image  = "${var.container_registry_login_server}/diamond-storefront:${var.image_tag}"
      cpu    = var.storefront_cpu
      memory = var.storefront_memory

      env {
        name  = "API_URL"
        value = "https://${azurerm_container_app.api.ingress[0].fqdn}"
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

  tags = var.tags

  depends_on = [azurerm_container_app.api]
}

# Grant API managed identity permission to trigger each scheduler job
resource "azurerm_role_assignment" "api_scheduler_job_operator" {
  for_each = var.enable_scheduler ? var.scheduler_feeds : {}

  scope                = azurerm_container_app_job.scheduler[each.key].id
  role_definition_name = "Container Apps Jobs Operator"
  principal_id         = azurerm_container_app.api.identity[0].principal_id
}

# Grant consolidator managed identity permission to trigger scheduler jobs (chain trigger).
# Referencing the user-assigned identity directly ensures principal_id is always
# resolved at plan time rather than depending on the Container App's runtime state.
resource "azurerm_role_assignment" "consolidator_scheduler_job_operator" {
  for_each = var.enable_scheduler ? var.scheduler_feeds : {}

  scope                = azurerm_container_app_job.scheduler[each.key].id
  role_definition_name = "Container Apps Jobs Operator"
  principal_id         = azurerm_user_assigned_identity.consolidator.principal_id
}
