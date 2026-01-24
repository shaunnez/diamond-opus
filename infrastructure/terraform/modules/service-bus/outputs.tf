output "namespace_id" {
  description = "ID of the Service Bus namespace"
  value       = azurerm_servicebus_namespace.main.id
}

output "namespace_name" {
  description = "Name of the Service Bus namespace"
  value       = azurerm_servicebus_namespace.main.name
}

output "connection_string" {
  description = "Connection string for application access"
  value       = azurerm_servicebus_namespace_authorization_rule.app.primary_connection_string
  sensitive   = true
}

output "queue_names" {
  description = "Names of the created queues"
  value = {
    work_items  = azurerm_servicebus_queue.work_items.name
    work_done   = azurerm_servicebus_queue.work_done.name
    consolidate = azurerm_servicebus_queue.consolidate.name
  }
}
