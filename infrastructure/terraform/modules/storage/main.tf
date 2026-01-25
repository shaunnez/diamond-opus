terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

resource "azurerm_storage_account" "main" {
  name                     = var.storage_account_name
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = var.account_tier
  account_replication_type = var.replication_type

  # Security settings
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false

  blob_properties {
    versioning_enabled = var.enable_versioning
  }

  tags = var.tags
}

resource "azurerm_storage_container" "watermarks" {
  name                  = "watermarks"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}
