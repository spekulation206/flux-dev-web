# Flux Dev Web

A Next.js web application for AI-powered image generation and editing.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
REPLICATE_API_TOKEN=your_replicate_token
GEMINI_API_KEY=your_gemini_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Deployment to Google Cloud Run

### Prerequisites

1. **Google Cloud SDK**: Install and configure gcloud CLI
   ```bash
   # Install gcloud (if not already installed)
   # macOS: brew install google-cloud-sdk
   # Or download from: https://cloud.google.com/sdk/docs/install
   
   # Authenticate
   gcloud auth login
   ```

2. **Docker**: Ensure Docker is installed and running
   ```bash
   # Verify Docker is running
   docker --version
   ```

3. **Set Environment Variables**: Configure your GCP project details
   ```bash
   export GCP_PROJECT_ID="your-project-id"
   export GCP_SERVICE_NAME="flux-dev-web"
   export GCP_REGION="us-central1"
   ```

### First-Time Deployment

1. **Create Secrets in Secret Manager** (required for environment variables):
   ```bash
   # Set your project
   gcloud config set project YOUR_PROJECT_ID
   
   # Create secrets
   echo -n "your_replicate_token" | gcloud secrets create REPLICATE_API_TOKEN --data-file=-
   echo -n "your_gemini_key" | gcloud secrets create GEMINI_API_KEY --data-file=-
   echo -n "your_google_client_id" | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
   echo -n "your_google_client_secret" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
   echo -n "https://your-service-url.run.app" | gcloud secrets create NEXT_PUBLIC_APP_URL --data-file=-
   ```
   
   **Note**: For `NEXT_PUBLIC_APP_URL`, you'll need to update this after the first deployment with your actual Cloud Run URL.

2. **Grant Cloud Run access to secrets**:
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
   gcloud secrets add-iam-policy-binding REPLICATE_API_TOKEN --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
   gcloud secrets add-iam-policy-binding GEMINI_API_KEY --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
   gcloud secrets add-iam-policy-binding GOOGLE_CLIENT_ID --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
   gcloud secrets add-iam-policy-binding GOOGLE_CLIENT_SECRET --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
   gcloud secrets add-iam-policy-binding NEXT_PUBLIC_APP_URL --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
   ```

3. **Run the deployment script**:
   ```bash
   ./redeploy_cloud_run.sh
   ```

### Redeployment

After the initial setup, redeploying is simple:

```bash
./redeploy_cloud_run.sh
```

The script automatically:
- Builds the Docker image using Cloud Build
- Deploys to Cloud Run with the correct configuration
- Sets up environment variables from Secret Manager

### Manual Deployment

If you prefer to deploy manually:

```bash
# Build and push image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/flux-dev-web

# Deploy to Cloud Run
gcloud run deploy flux-dev-web \
  --image gcr.io/YOUR_PROJECT_ID/flux-dev-web \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 2Gi \
  --cpu 2
```

### Updating Secrets

To update a secret value:

```bash
echo -n "new_value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

After updating secrets, redeploy the service for changes to take effect.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
