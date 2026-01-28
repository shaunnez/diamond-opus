terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

resource "azurerm_servicebus_namespace" "main" {
  name                = var.namespace_name
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = var.sku

  tags = var.tags
}

resource "azurerm_servicebus_queue" "work_items" {
  name         = "work-items"
  namespace_id = azurerm_servicebus_namespace.main.id

  # Continuation pattern: each message processes one page quickly (under 60s)
  # Reduced lock duration from PT5M to PT2M for faster processing
  lock_duration                       = "PT2M"
  max_delivery_count                  = 5
  dead_lettering_on_message_expiration = true
  default_message_ttl                 = "P1D"

  # Enable duplicate detection for continuation pattern deduplication
  requires_duplicate_detection        = true
  duplicate_detection_history_time_window = "PT10M"
}

resource "azurerm_servicebus_queue" "work_done" {
  name         = "work-done"
  namespace_id = azurerm_servicebus_namespace.main.id

  lock_duration                       = "PT1M"
  max_delivery_count                  = 3
  dead_lettering_on_message_expiration = true
  default_message_ttl                 = "P1D"
}

resource "azurerm_servicebus_queue" "consolidate" {
  name         = "consolidate"
  namespace_id = azurerm_servicebus_namespace.main.id

  # Consolidation can take longer
  lock_duration                       = "PT5M"
  max_delivery_count                  = 3
  dead_lettering_on_message_expiration = true
  default_message_ttl                 = "P1D"
}

# Authorization rule for application access
resource "azurerm_servicebus_namespace_authorization_rule" "app" {
  name         = "app-access"
  namespace_id = azurerm_servicebus_namespace.main.id

  listen = true
  send   = true
  manage = true  # Required for KEDA to read queue metrics
}
