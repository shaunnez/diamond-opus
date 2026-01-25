output "environment_id" {
  description = "ID of the Container Apps Environment"
  value       = azurerm_container_app_environment.main.id
}

output "environment_name" {
  description = "Name of the Container Apps Environment"
  value       = azurerm_container_app_environment.main.name
}

output "api_fqdn" {
  description = "Fully qualified domain name of the API app"
  value       = azurerm_container_app.api.ingress[0].fqdn
}

output "api_url" {
  description = "URL of the API app"
  value       = "https://${azurerm_container_app.api.ingress[0].fqdn}"
}

output "api_name" {
  description = "Name of the API container app"
  value       = azurerm_container_app.api.name
}

output "worker_name" {
  description = "Name of the worker container app"
  value       = azurerm_container_app.worker.name
}

output "consolidator_name" {
  description = "Name of the consolidator container app"
  value       = azurerm_container_app.consolidator.name
}

output "scheduler_job_name" {
  description = "Name of the scheduler job"
  value       = azurerm_container_app_job.scheduler.name
}

output "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.id
}
