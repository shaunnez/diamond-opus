#!/bin/bash
# Script to import existing resource groups into Terraform state
# Usage: ./import-resource-group.sh <environment>
# Example: ./import-resource-group.sh staging

set -e

ENVIRONMENT=$1

if [ -z "$ENVIRONMENT" ]; then
  echo "Usage: $0 <environment>"
  echo "Example: $0 staging"
  exit 1
fi

if [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "prod" ]; then
  echo "Error: environment must be 'staging' or 'prod'"
  exit 1
fi

cd "$(dirname "$0")/environments/$ENVIRONMENT"

echo "Attempting to import resource group for $ENVIRONMENT environment..."
echo ""

# Try to get subscription ID from Azure CLI
SUBSCRIPTION_ID=$(az account show --query id -o tsv 2>/dev/null || echo "")

if [ -z "$SUBSCRIPTION_ID" ]; then
  echo "Could not detect Azure subscription ID. Please ensure you're logged in:"
  echo "  az login"
  echo ""
  echo "Or manually run:"
  echo "  terraform import azurerm_resource_group.main \"/subscriptions/YOUR_SUB_ID/resourceGroups/diamond-$ENVIRONMENT-rg\""
  exit 1
fi

RESOURCE_GROUP_ID="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/diamond-$ENVIRONMENT-rg"

echo "Importing resource group: diamond-$ENVIRONMENT-rg"
echo "Resource ID: $RESOURCE_GROUP_ID"
echo ""

# Check if resource group exists
if ! az group show --name "diamond-$ENVIRONMENT-rg" &>/dev/null; then
  echo "Error: Resource group 'diamond-$ENVIRONMENT-rg' does not exist in Azure"
  exit 1
fi

# Import the resource
terraform import azurerm_resource_group.main "$RESOURCE_GROUP_ID"

echo ""
echo "✓ Resource group imported successfully!"
echo ""
echo "Next steps:"
echo "1. Run 'terraform plan' to verify the import"
echo "2. Run 'terraform apply' to update the infrastructure"
