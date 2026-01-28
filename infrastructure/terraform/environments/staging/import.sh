#!/bin/bash
# Import existing Azure resources into Terraform state
# Run this from the staging directory: ./import.sh

set -e

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RG="diamond-staging-rg"

echo "Using subscription: ${SUBSCRIPTION_ID}"
echo "Resource group: ${RG}"
echo ""

# Resource Group
echo "Importing resource group..."
terraform import 'azurerm_resource_group.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}" || true

# Service Bus Namespace
echo "Importing service bus namespace..."
terraform import 'module.service_bus.azurerm_servicebus_namespace.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ServiceBus/namespaces/diamond-staging-servicebus" || true

# Service Bus Queues
echo "Importing service bus queue: work-items..."
terraform import 'module.service_bus.azurerm_servicebus_queue.work_items' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ServiceBus/namespaces/diamond-staging-servicebus/queues/work-items" || true

echo "Importing service bus queue: work-done..."
terraform import 'module.service_bus.azurerm_servicebus_queue.work_done' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ServiceBus/namespaces/diamond-staging-servicebus/queues/work-done" || true

echo "Importing service bus queue: consolidate..."
terraform import 'module.service_bus.azurerm_servicebus_queue.consolidate' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ServiceBus/namespaces/diamond-staging-servicebus/queues/consolidate" || true

# Service Bus Authorization Rule
echo "Importing service bus authorization rule..."
terraform import 'module.service_bus.azurerm_servicebus_namespace_authorization_rule.app' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ServiceBus/namespaces/diamond-staging-servicebus/authorizationRules/app-access" || true

# Storage Account
echo "Importing storage account..."
terraform import 'module.storage.azurerm_storage_account.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.Storage/storageAccounts/diamondstagingstore" || true

# Storage Container
echo "Importing storage container: watermarks..."
terraform import 'module.storage.azurerm_storage_container.watermarks' \
  "https://diamondstagingstore.blob.core.windows.net/watermarks" || true

# Container Registry
echo "Importing container registry..."
terraform import 'module.container_registry.azurerm_container_registry.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ContainerRegistry/registries/diamondstagingacr" || true

# Container Apps (note the [0] index due to count)
echo "Importing log analytics workspace..."
terraform import 'module.container_apps[0].azurerm_log_analytics_workspace.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.OperationalInsights/workspaces/diamond-staging-env-logs" || true

echo "Importing container app environment..."
terraform import 'module.container_apps[0].azurerm_container_app_environment.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/managedEnvironments/diamond-staging-env" || true

echo "Importing API container app..."
terraform import 'module.container_apps[0].azurerm_container_app.api' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/diamond-staging-api" || true

echo "Importing worker container app..."
terraform import 'module.container_apps[0].azurerm_container_app.worker' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/diamond-staging-worker" || true

echo "Importing consolidator container app..."
terraform import 'module.container_apps[0].azurerm_container_app.consolidator' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/diamond-staging-consolidator" || true

echo "Importing dashboard container app..."
terraform import 'module.container_apps[0].azurerm_container_app.dashboard' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/diamond-staging-dashboard" || true

echo "Importing scheduler job..."
terraform import 'module.container_apps[0].azurerm_container_app_job.scheduler' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/jobs/diamond-staging-scheduler" || true

echo ""
echo "Import complete. Run 'terraform plan' to verify state."
