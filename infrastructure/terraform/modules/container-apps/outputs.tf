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

output "api_identity_principal_id" {
  description = "Principal ID of the API's managed identity (for granting scheduler job trigger permissions)"
  value       = azurerm_container_app.api.identity[0].principal_id
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
  description = "Name of the scheduler job (null if scheduler is disabled)"
  value       = var.enable_scheduler ? azurerm_container_app_job.scheduler[0].name : null
}

output "demo_feed_api_fqdn" {
  description = "Fully qualified domain name of the demo feed API (internal)"
  value       = azurerm_container_app.demo_feed_api.ingress[0].fqdn
}

output "demo_feed_api_name" {
  description = "Name of the demo feed API container app"
  value       = azurerm_container_app.demo_feed_api.name
}

output "dashboard_fqdn" {
  description = "Fully qualified domain name of the dashboard app"
  value       = azurerm_container_app.dashboard.ingress[0].fqdn
}

output "dashboard_url" {
  description = "URL of the dashboard app"
  value       = "https://${azurerm_container_app.dashboard.ingress[0].fqdn}"
}

output "dashboard_name" {
  description = "Name of the dashboard container app"
  value       = azurerm_container_app.dashboard.name
}

output "api_custom_domain_verification_id" {
  description = "Custom domain verification ID for the API Container App. Use this as the value of a TXT record (name: asuid.<subdomain>) for domain verification when using Cloudflare proxy."
  value       = azurerm_container_app.api.custom_domain_verification_id
}

output "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.id
}
