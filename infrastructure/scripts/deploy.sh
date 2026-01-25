#!/bin/bash
set -e

# Deploy infrastructure for a specific environment
# Usage: ./deploy.sh <environment> [plan|apply|destroy]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$INFRA_DIR/terraform"

ENVIRONMENT="${1:-staging}"
ACTION="${2:-plan}"

if [[ ! "$ENVIRONMENT" =~ ^(staging|prod)$ ]]; then
    echo "Error: Environment must be 'staging' or 'prod'"
    echo "Usage: $0 <environment> [plan|apply|destroy]"
    exit 1
fi

if [[ ! "$ACTION" =~ ^(plan|apply|destroy)$ ]]; then
    echo "Error: Action must be 'plan', 'apply', or 'destroy'"
    echo "Usage: $0 <environment> [plan|apply|destroy]"
    exit 1
fi

ENV_DIR="$TERRAFORM_DIR/environments/$ENVIRONMENT"

echo "=== Diamond Infrastructure Deployment ==="
echo "Environment: $ENVIRONMENT"
echo "Action: $ACTION"
echo "Directory: $ENV_DIR"
echo ""

# Check if logged in
echo "Checking Azure CLI login status..."
if ! az account show &> /dev/null; then
    echo "Not logged in. Running 'az login'..."
    az login
fi

# Change to environment directory
cd "$ENV_DIR"

# Initialize Terraform
echo "Initializing Terraform..."
terraform init -upgrade

# Run the requested action
case "$ACTION" in
    plan)
        echo "Running terraform plan..."
        terraform plan -out=tfplan
        echo ""
        echo "Plan saved to tfplan. Run '$0 $ENVIRONMENT apply' to apply."
        ;;
    apply)
        if [[ -f tfplan ]]; then
            echo "Applying saved plan..."
            terraform apply tfplan
            rm -f tfplan
        else
            echo "Running terraform apply..."
            terraform apply
        fi
        echo ""
        echo "=== Deployment Complete ==="
        echo ""
        echo "To get connection strings for your .env file, run:"
        echo "  cd $ENV_DIR"
        echo "  terraform output -raw service_bus_connection_string"
        echo "  terraform output -raw storage_connection_string"
        ;;
    destroy)
        echo "WARNING: This will destroy all resources in $ENVIRONMENT!"
        read -p "Are you sure? (yes/no): " confirm
        if [[ "$confirm" == "yes" ]]; then
            terraform destroy
        else
            echo "Destroy cancelled."
        fi
        ;;
esac
