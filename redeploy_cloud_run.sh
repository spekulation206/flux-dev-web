#!/bin/bash

# Google Cloud Run Redeployment Script
# This script builds and deploys the Next.js app to Google Cloud Run

set -e  # Exit on error

# Configuration - Update these values as needed
# Try to get project from gcloud config, fallback to environment variable or default
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo 'your-project-id')}"
SERVICE_NAME="${GCP_SERVICE_NAME:-flux-dev-web}"
REGION="${GCP_REGION:-us-central1}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Google Cloud Run deployment...${NC}\n"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed.${NC}"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Note: Cloud Build handles Docker builds remotely, so local Docker is not required
# However, if you want to test builds locally, Docker is recommended
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker is available (optional for Cloud Build)${NC}"
fi

# Set the project
echo -e "${YELLOW}📋 Setting GCP project to ${PROJECT_ID}...${NC}"
gcloud config set project "${PROJECT_ID}"

# Enable required APIs
echo -e "${YELLOW}🔧 Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build the Docker image using Cloud Build
echo -e "${YELLOW}🏗️  Building Docker image...${NC}"
gcloud builds submit --tag "${IMAGE_NAME}" --quiet

# Check if secrets exist, otherwise use environment variables from .env
USE_SECRETS=false
if gcloud secrets describe REPLICATE_API_TOKEN &>/dev/null; then
    USE_SECRETS=true
    echo -e "${GREEN}✓ Using Secret Manager for environment variables${NC}"
else
    echo -e "${YELLOW}⚠ Secrets not found, will use environment variables from .env file${NC}"
fi

# Prepare arguments for deployment
DEPLOY_ARGS=(
  "${SERVICE_NAME}"
  "--image" "${IMAGE_NAME}"
  "--platform" "managed"
  "--region" "${REGION}"
  "--allow-unauthenticated"
  "--quiet"
  "--port" "3000"
  "--memory" "2Gi"
  "--cpu" "2"
  "--min-instances" "0"
  "--max-instances" "10"
  "--set-env-vars" "NODE_ENV=production"
)

# Add secrets or env vars
if [ "$USE_SECRETS" = true ]; then
    DEPLOY_ARGS+=(
      "--set-secrets" "REPLICATE_API_TOKEN=REPLICATE_API_TOKEN:latest"
      "--set-secrets" "GEMINI_API_KEY=GEMINI_API_KEY:latest"
      "--set-secrets" "GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest"
      "--set-secrets" "GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest"
      "--set-secrets" "NEXT_PUBLIC_APP_URL=NEXT_PUBLIC_APP_URL:latest"
      "--set-env-vars" "DEPLOY_TIMESTAMP=$(date +%s)"
    )
else
    # Load from .env file if it exists
    if [ -f .env ]; then
        echo -e "${YELLOW}📝 Loading environment variables from .env file...${NC}"
        # Source .env and add to deployment
        # NOTE: We do NOT use the NEXT_PUBLIC_APP_URL from .env because it might be outdated.
        # We will update it AFTER deployment with the correct Cloud Run URL.
        export $(grep -v '^#' .env | grep -v 'NEXT_PUBLIC_APP_URL' | xargs)
        
        # Validate critical variables
        MISSING_CRITICAL=false
        if [ -z "$GOOGLE_CLIENT_ID" ]; then 
            echo -e "${RED}❌ Missing GOOGLE_CLIENT_ID in .env${NC}"
            MISSING_CRITICAL=true
        fi
        if [ -z "$GOOGLE_CLIENT_SECRET" ]; then 
            echo -e "${RED}❌ Missing GOOGLE_CLIENT_SECRET in .env${NC}"
            MISSING_CRITICAL=true
        fi

        if [ "$MISSING_CRITICAL" = true ]; then
             echo -e "${YELLOW}⚠ Warning: Google Photos integration will fail without credentials.${NC}"
        fi
        
        DEPLOY_ARGS+=(
          "--set-env-vars" "REPLICATE_API_TOKEN=${REPLICATE_API_TOKEN}"
          "--set-env-vars" "GEMINI_API_KEY=${GEMINI_API_KEY}"
          "--set-env-vars" "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
          "--set-env-vars" "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}"
          "--set-env-vars" "NEXT_PUBLIC_APP_URL=PENDING_UPDATE"
          "--set-env-vars" "DEPLOY_TIMESTAMP=$(date +%s)"
        )
    else
        echo -e "${RED}❌ Error: No secrets found and no .env file exists.${NC}"
        echo "Please either:"
        echo "  1. Create secrets in Secret Manager, or"
        echo "  2. Create a .env file with required variables"
        exit 1
    fi
fi

# Deploy to Cloud Run
echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy "${DEPLOY_ARGS[@]}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format 'value(status.url)')

# Update NEXT_PUBLIC_APP_URL with the actual service URL
echo -e "${YELLOW}🔄 Updating NEXT_PUBLIC_APP_URL to ${SERVICE_URL}...${NC}"

if [ "$USE_SECRETS" = true ]; then
    # If using secrets, update the Secret Manager version and then the Cloud Run service
    echo "  Updating Secret Manager..."
    echo -n "${SERVICE_URL}" | gcloud secrets versions add NEXT_PUBLIC_APP_URL --data-file=-
    
    echo "  Updating Cloud Run service to use new secret version..."
    gcloud run services update "${SERVICE_NAME}" \
      --region "${REGION}" \
      --quiet \
      --update-secrets NEXT_PUBLIC_APP_URL=NEXT_PUBLIC_APP_URL:latest
else
    gcloud run services update "${SERVICE_NAME}" \
      --region "${REGION}" \
      --quiet \
      --update-env-vars NEXT_PUBLIC_APP_URL="${SERVICE_URL}"
fi

echo -e "\n${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}🌐 Service URL: ${SERVICE_URL}${NC}\n"

echo -e "${YELLOW}📝 Note: Make sure you have created the secrets in Secret Manager:${NC}"
echo "  - REPLICATE_API_TOKEN"
echo "  - GEMINI_API_KEY"
echo "  - GOOGLE_CLIENT_ID"
echo "  - GOOGLE_CLIENT_SECRET"
echo "  - NEXT_PUBLIC_APP_URL"
echo ""
echo -e "${YELLOW}⚠️  Permission Check:${NC}"
echo "Ensure the Cloud Run service account has the 'Cloud Datastore User' or 'Firebase Admin' role for Firestore access."
echo ""
echo "To create secrets, use:"
echo "  gcloud secrets create SECRET_NAME --data-file=- <<< 'your-secret-value'"
