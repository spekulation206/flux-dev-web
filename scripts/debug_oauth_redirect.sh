#!/bin/bash

# Debug script to check OAuth redirect URI configuration

echo "🔍 OAuth Redirect URI Debug"
echo "============================"
echo ""

# Get Cloud Run service URL
SERVICE_URL=$(gcloud run services describe flux-dev-web --region us-central1 --format="value(status.url)" 2>/dev/null)

if [ -z "$SERVICE_URL" ]; then
    echo "❌ Error: Could not get Cloud Run service URL"
    exit 1
fi

EXPECTED_REDIRECT_URI="${SERVICE_URL}/api/auth/google/callback"

echo "Cloud Run Service URL: $SERVICE_URL"
echo "Expected Redirect URI: $EXPECTED_REDIRECT_URI"
echo ""

# Check what's actually being sent
echo "📤 Checking what redirect URI is being sent..."
echo ""

REDIRECT_SENT=$(curl -s "${SERVICE_URL}/api/auth/google/signin" -L -I 2>&1 | grep -i "location:" | head -1 | sed 's/location: //' | python3 -c "
import sys
import urllib.parse
url = sys.stdin.read().strip()
parsed = urllib.parse.urlparse(url)
query = urllib.parse.parse_qs(parsed.query)
redirect_uri = query.get('redirect_uri', ['NOT FOUND'])[0]
print(urllib.parse.unquote(redirect_uri))
" 2>/dev/null)

if [ -n "$REDIRECT_SENT" ]; then
    echo "Redirect URI being sent: $REDIRECT_SENT"
    echo ""
    
    if [ "$REDIRECT_SENT" = "$EXPECTED_REDIRECT_URI" ]; then
        echo "✅ Redirect URI matches expected value"
    else
        echo "❌ MISMATCH!"
        echo "   Expected: $EXPECTED_REDIRECT_URI"
        echo "   Actual:   $REDIRECT_SENT"
    fi
else
    echo "⚠️  Could not determine redirect URI from response"
fi

echo ""
echo "📋 Google Cloud Console Configuration Required:"
echo "==============================================="
echo ""
echo "1. Go to: https://console.cloud.google.com/apis/credentials"
echo ""
echo "2. Find OAuth 2.0 Client ID: 310306714158-dm32scl60hr74q7llgprbct4qmcill1g.apps.googleusercontent.com"
echo ""
echo "3. Click 'Edit'"
echo ""
echo "4. Under 'Authorized redirect URIs', ensure this EXACT URI is listed:"
echo "   $EXPECTED_REDIRECT_URI"
echo ""
echo "5. Important:"
echo "   - Must match EXACTLY (including https://)"
echo "   - No trailing slash"
echo "   - Case-sensitive"
echo ""
echo "6. Click 'Save'"
echo ""
echo "7. Wait 2-3 minutes for changes to propagate"

