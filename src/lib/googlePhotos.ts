export async function uploadToGooglePhotos(file: File, description?: string): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  if (description) {
    formData.append("description", description);
  }

  const response = await fetch("/api/google-photos/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    // If 401, maybe prompt to reconnect?
    if (response.status === 401) {
      throw new Error("Google Photos not connected");
    }
    throw new Error(error.error || "Google Photos upload failed");
  }
}
