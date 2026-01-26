#!/bin/bash
# Cleanup script to delete all container apps in a resource group
# Usage: ./scripts/cleanup-container-apps.sh [staging|prod]

set -e

ENVIRONMENT="${1:-staging}"

if [[ "$ENVIRONMENT" == "staging" ]]; then
  RESOURCE_GROUP="diamond-staging-rg"
elif [[ "$ENVIRONMENT" == "prod" ]]; then
  RESOURCE_GROUP="diamond-prod-rg"
  echo "WARNING: You are about to delete PRODUCTION container apps!"
  read -p "Are you sure? Type 'yes' to continue: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
else
  echo "Usage: $0 [staging|prod]"
  exit 1
fi

echo "Cleaning up container apps in resource group: $RESOURCE_GROUP"

# Delete container apps
echo "Deleting container apps..."
for app in $(az containerapp list --resource-group "$RESOURCE_GROUP" --query "[].name" -o tsv 2>/dev/null || echo ""); do
  if [[ -n "$app" ]]; then
    echo "  Deleting app: $app"
    az containerapp delete --name "$app" --resource-group "$RESOURCE_GROUP" --yes
  fi
done

# Delete container app jobs
echo "Deleting container app jobs..."
for job in $(az containerapp job list --resource-group "$RESOURCE_GROUP" --query "[].name" -o tsv 2>/dev/null || echo ""); do
  if [[ -n "$job" ]]; then
    echo "  Deleting job: $job"
    az containerapp job delete --name "$job" --resource-group "$RESOURCE_GROUP" --yes
  fi
done

echo "Cleanup complete for $RESOURCE_GROUP"
