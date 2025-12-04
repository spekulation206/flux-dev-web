import { cookies } from "next/headers";

const ALBUM_TITLE = "flux dev";

// Retry helper for Google Photos API quota limits
async function fetchWithRetry(url: string, options: RequestInit, retries = 5, delay = 3000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      // Return immediately if successful
      if (response.ok) {
        return response;
      }

      // Check for quota errors (429 Too Many Requests or 403 Forbidden with quota message)
      // We also retry 5xx errors just in case of transient server issues
      const isQuotaError = response.status === 429 || (response.status === 403);
      const isServerError = response.status >= 500;
      
      if (!isQuotaError && !isServerError) {
         return response; // Return the error response for the caller to handle (e.g. 401, 400)
      }
      
      // Clone response to read text without consuming the original stream if we return it later
      // (Though we won't return it unless it's the last attempt)
      const text = await response.clone().text();
      console.warn(`Google Photos API request failed (attempt ${i + 1}/${retries}): ${response.status} ${text}`);
      
      if (i === retries - 1) return response; // Return the last response if out of retries

    } catch (error) {
      console.warn(`Google Photos API network error (attempt ${i + 1}/${retries}):`, error);
      if (i === retries - 1) throw error;
    }

    // Exponential backoff with jitter
    // Delay: 1000ms, 2000ms, 4000ms... + random jitter
    const jitter = Math.random() * 500;
    const waitTime = delay * Math.pow(2, i) + jitter;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  throw new Error("Unreachable code in fetchWithRetry");
}

export async function getAccessToken() {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get("google_access_token")?.value;
  const refreshToken = cookieStore.get("google_refresh_token")?.value;

  if (!accessToken && refreshToken) {
    // Refresh token
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("Google credentials missing in environment variables during token refresh");
      throw new Error("Server configuration error: Missing Google credentials");
    }

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      const tokens = await response.json();
      if (response.ok) {
        accessToken = tokens.access_token;
        // Update cookie - Note: We can't set cookies in a server action helper directly if not in a route handler context easily 
        // but for now we return the token. The caller might need to set the cookie.
        // Actually, next/headers cookies().set() works in Server Actions and Route Handlers.
        cookieStore.set("google_access_token", tokens.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: tokens.expires_in,
          path: "/",
        });
      } else {
        console.error("Token refresh response not ok:", tokens);
        // If the refresh token is invalid (e.g. revoked or expired), clear the cookies
        if (tokens.error === 'invalid_grant' || response.status === 400 || response.status === 401) {
            console.log("Clearing invalid Google auth cookies");
            cookieStore.delete("google_access_token");
            cookieStore.delete("google_refresh_token");
        }
      }
    } catch (e) {
      console.error("Token refresh failed", e);
    }
  }

  return accessToken;
}

async function findOrCreateAlbum(accessToken: string) {
  // 1. List app-created albums
  let nextPageToken = "";
  let albumId = null;

  do {
    const url = new URL("https://photoslibrary.googleapis.com/v1/albums");
    url.searchParams.append("excludeNonAppCreatedData", "true");
    if (nextPageToken) url.searchParams.append("pageToken", nextPageToken);

    const response = await fetchWithRetry(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error("Failed to list albums:", response.status, text);
      break;
    }
    
    const data = await response.json();
    const albums = data.albums || [];
    const found = albums.find((a: any) => a.title === ALBUM_TITLE);
    
    if (found) {
      albumId = found.id;
      break;
    }
    
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  if (albumId) return albumId;

  // 2. Create if not found
  const createResponse = await fetchWithRetry("https://photoslibrary.googleapis.com/v1/albums", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ album: { title: ALBUM_TITLE } }),
  });

  if (!createResponse.ok) {
    const text = await createResponse.text();
    throw new Error(`Failed to create album: ${text}`);
  }

  const newAlbum = await createResponse.json();
  return newAlbum.id;
}

export async function uploadBufferToGooglePhotos(
  accessToken: string, 
  arrayBuffer: ArrayBuffer | Buffer, 
  filename: string, 
  description: string
) {
  // 1. Find or Create Album
  const albumId = await findOrCreateAlbum(accessToken);

  // 2. Upload Bytes
  // Note: The upload endpoint is sensitive to timeouts for large files, so we might want to be careful with retries here,
  // but for small generated images it should be fine.
  const uploadResponse = await fetchWithRetry("https://photoslibrary.googleapis.com/v1/uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "X-Goog-Upload-File-Name": filename,
      "X-Goog-Upload-Protocol": "raw",
    },
    body: arrayBuffer as any,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Upload failed: ${text}`);
  }

  const uploadToken = await uploadResponse.text();

  // 3. Create Media Item
  // This is where "concurrent write request" quota errors typically occur
  const createItemResponse = await fetchWithRetry("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      albumId,
      newMediaItems: [
        {
          description,
          simpleMediaItem: {
            uploadToken,
          },
        },
      ],
    }),
  });

  if (!createItemResponse.ok) {
    const text = await createItemResponse.text();
    throw new Error(`Media creation failed: ${text}`);
  }

  const result = await createItemResponse.json();
  return result;
}
