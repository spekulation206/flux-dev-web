import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("google_access_token")?.value;
  const refreshToken = cookieStore.get("google_refresh_token")?.value;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const isConfigured = !!(clientId && clientSecret);

  // Check if connected (has tokens)
  const connected = !!(accessToken || refreshToken);

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
