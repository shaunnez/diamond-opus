#!/bin/bash
# Import existing Azure resources into Terraform state
# Run this from the prod directory: ./import.sh

set -e

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RG="diamond-prod-rg"

echo "Using subscription: ${SUBSCRIPTION_ID}"
echo "Resource group: ${RG}"
echo ""

# Resource Group
echo "Importing resource group..."
terraform import 'azurerm_resource_group.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}" || true

# Service Bus
echo "Importing service bus..."
terraform import 'module.service_bus.azurerm_servicebus_namespace.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ServiceBus/namespaces/diamond-prod-servicebus" || true

# Storage Account
echo "Importing storage account..."
terraform import 'module.storage.azurerm_storage_account.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.Storage/storageAccounts/diamondprodstore" || true

# Container Registry
echo "Importing container registry..."
terraform import 'module.container_registry.azurerm_container_registry.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ContainerRegistry/registries/diamondprodacr" || true

# Container Apps (note the [0] index due to count)
echo "Importing log analytics workspace..."
terraform import 'module.container_apps[0].azurerm_log_analytics_workspace.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.OperationalInsights/workspaces/diamond-prod-env-logs" || true

echo "Importing container app environment..."
terraform import 'module.container_apps[0].azurerm_container_app_environment.main' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/managedEnvironments/diamond-prod-env" || true

echo "Importing API container app..."
terraform import 'module.container_apps[0].azurerm_container_app.api' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/diamond-prod-api" || true

echo "Importing worker container app..."
terraform import 'module.container_apps[0].azurerm_container_app.worker' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/diamond-prod-worker" || true

echo "Importing consolidator container app..."
terraform import 'module.container_apps[0].azurerm_container_app.consolidator' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/diamond-prod-consolidator" || true

echo "Importing dashboard container app..."
terraform import 'module.container_apps[0].azurerm_container_app.dashboard' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/diamond-prod-dashboard" || true

echo "Importing scheduler job..."
terraform import 'module.container_apps[0].azurerm_container_app_job.scheduler' \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.App/jobs/diamond-prod-scheduler" || true

echo ""
echo "Import complete. Run 'terraform plan' to verify state."
