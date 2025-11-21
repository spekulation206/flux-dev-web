#!/bin/bash

# Setup Google Cloud Secret Manager
# Reads from .env and creates/updates secrets in GCP

set -e

# Configuration
PROJECT_ID="golden-bonbon-327902"
SERVICE_ACCOUNT="310306714158-compute@developer.gserviceaccount.com"
SECRETS=(
  "REPLICATE_API_TOKEN"
  "GEMINI_API_KEY"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "NEXT_PUBLIC_APP_URL"
)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔐 Starting Secret Manager setup for project ${PROJECT_ID}...${NC}"

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found.${NC}"
    exit 1
fi

# Load .env variables
echo -e "${YELLOW}📖 Reading .env file...${NC}"
# Export variables from .env, ignoring comments and empty lines
export $(grep -v '^#' .env | xargs)

for SECRET_NAME in "${SECRETS[@]}"; do
    VALUE="${!SECRET_NAME}"
    
    if [ -z "$VALUE" ]; then
        echo -e "${YELLOW}⚠ Warning: ${SECRET_NAME} is empty or missing in .env. Skipping.${NC}"
        continue
    fi

    echo -e "\n${YELLOW}Processing ${SECRET_NAME}...${NC}"

    # Check if secret exists
    if ! gcloud secrets describe "${SECRET_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
        echo "  Creating secret ${SECRET_NAME}..."
        gcloud secrets create "${SECRET_NAME}" --project="${PROJECT_ID}" --replication-policy="automatic"
    else
        echo "  Secret ${SECRET_NAME} already exists."
    fi

    # Add new version
    echo "  Adding new version..."
    echo -n "${VALUE}" | gcloud secrets versions add "${SECRET_NAME}" --project="${PROJECT_ID}" --data-file=-

    # Grant access to service account
    echo "  Granting access to ${SERVICE_ACCOUNT}..."
    gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
        --project="${PROJECT_ID}" \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet > /dev/null
        
    echo -e "${GREEN}✓ ${SECRET_NAME} updated and access granted.${NC}"
done

echo -e "\n${GREEN}✅ Secret setup complete!${NC}"
echo -e "You can now redeploy with ./redeploy_cloud_run.sh and it will automatically use these secrets."

