import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAccessToken } from "@/lib/googlePhotosServer";

export async function GET() {
  // Proactively check/refresh token to ensure validity
  // This will clear cookies if the refresh token is invalid/revoked
  const accessToken = await getAccessToken();
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("google_refresh_token")?.value;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const isConfigured = !!(clientId && clientSecret);

  // Connected if we have a valid access token (either existing or just refreshed)
  const connected = !!accessToken;

  return NextResponse.json({ 
    connected,
    configured: isConfigured,
    debug: {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      envClientId: !!clientId,
      envClientSecret: !!clientSecret
    }
  });
}
