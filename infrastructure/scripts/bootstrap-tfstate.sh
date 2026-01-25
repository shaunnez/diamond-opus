#!/bin/bash
set -e

# Bootstrap script to create Terraform state storage
# Run this ONCE before using Terraform for the first time

SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-2dade7a0-6731-4d26-ba6d-02228cccbe2d}"
RESOURCE_GROUP="diamond-tfstate-rg"
STORAGE_ACCOUNT="diamondtfstate"
CONTAINER_NAME="tfstate"
LOCATION="australiaeast"

echo "=== Terraform State Bootstrap ==="
echo "Subscription: $SUBSCRIPTION_ID"
echo "Resource Group: $RESOURCE_GROUP"
echo "Storage Account: $STORAGE_ACCOUNT"
echo "Location: $LOCATION"
echo ""

# Check if logged in
echo "Checking Azure CLI login status..."
if ! az account show &> /dev/null; then
    echo "Not logged in. Running 'az login'..."
    az login
fi

# Set subscription
echo "Setting subscription..."
az account set --subscription "$SUBSCRIPTION_ID"

# Create resource group
echo "Creating resource group..."
az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --tags Environment=shared Project=diamond ManagedBy=terraform-bootstrap

# Create storage account
echo "Creating storage account..."
az storage account create \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false \
    --tags Environment=shared Project=diamond ManagedBy=terraform-bootstrap

# Get storage account key
echo "Getting storage account key..."
ACCOUNT_KEY=$(az storage account keys list \
    --resource-group "$RESOURCE_GROUP" \
    --account-name "$STORAGE_ACCOUNT" \
    --query '[0].value' \
    --output tsv)

# Create blob container
echo "Creating blob container..."
az storage container create \
    --name "$CONTAINER_NAME" \
    --account-name "$STORAGE_ACCOUNT" \
    --account-key "$ACCOUNT_KEY"

echo ""
echo "=== Bootstrap Complete ==="
echo ""
echo "Terraform backend configuration:"
echo "  resource_group_name  = \"$RESOURCE_GROUP\""
echo "  storage_account_name = \"$STORAGE_ACCOUNT\""
echo "  container_name       = \"$CONTAINER_NAME\""
echo ""
echo "You can now run 'terraform init' in any environment directory."
