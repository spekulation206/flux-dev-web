import { cookies } from "next/headers";

const ALBUM_TITLE = "flux dev";

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

    const response = await fetch(url.toString(), {
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
  const createResponse = await fetch("https://photoslibrary.googleapis.com/v1/albums", {
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
  const uploadResponse = await fetch("https://photoslibrary.googleapis.com/v1/uploads", {
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
  const createItemResponse = await fetch("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", {
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
