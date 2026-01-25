output "storage_account_id" {
  description = "ID of the storage account"
  value       = azurerm_storage_account.main.id
}

output "storage_account_name" {
  description = "Name of the storage account"
  value       = azurerm_storage_account.main.name
}

output "primary_connection_string" {
  description = "Primary connection string for the storage account"
  value       = azurerm_storage_account.main.primary_connection_string
  sensitive   = true
}

output "primary_blob_endpoint" {
  description = "Primary blob endpoint URL"
  value       = azurerm_storage_account.main.primary_blob_endpoint
}

output "watermarks_container_name" {
  description = "Name of the watermarks container"
  value       = azurerm_storage_container.watermarks.name
}
