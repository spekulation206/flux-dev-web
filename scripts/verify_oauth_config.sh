#!/bin/bash

# Script to verify Google OAuth configuration

echo "🔍 Google OAuth Configuration Checker"
echo "======================================"
echo ""

# Get Cloud Run service URL
SERVICE_URL=$(gcloud run services describe flux-dev-web --region us-central1 --format="value(status.url)" 2>/dev/null)

if [ -z "$SERVICE_URL" ]; then
    echo "❌ Error: Could not get Cloud Run service URL"
    exit 1
fi

REDIRECT_URI="${SERVICE_URL}/api/auth/google/callback"

echo "Cloud Run Service URL: $SERVICE_URL"
echo "Expected Redirect URI: $REDIRECT_URI"
echo ""
echo "📋 Steps to fix redirect_uri_mismatch:"
echo "======================================"
echo ""
echo "1. Go to: https://console.cloud.google.com/apis/credentials"
echo ""
echo "2. Find OAuth 2.0 Client ID: 310306714158-dm32scl60hr74q7llgprbct4qmcill1g.apps.googleusercontent.com"
echo ""
echo "3. Click 'Edit'"
echo ""
echo "4. Under 'Authorized redirect URIs', ensure this EXACT URI is listed:"
echo "   $REDIRECT_URI"
echo ""
echo "5. Important checks:"
echo "   ✓ Must use https:// (not http://)"
echo "   ✓ Must include /api/auth/google/callback path"
echo "   ✓ No trailing slash"
echo "   ✓ Exact match (case-sensitive)"
echo ""
echo "6. Click 'Save'"
echo ""
echo "7. Wait 2-3 minutes for changes to propagate"
echo ""
echo "💡 If the URI is already there, try:"
echo "   - Removing it and re-adding it"
echo "   - Checking for extra spaces or characters"
echo "   - Verifying you're editing the correct OAuth client"

