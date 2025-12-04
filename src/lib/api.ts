export async function uploadToReplicate(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/replicate/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Upload failed");
  }

  const data = await response.json();
  return data.urls.get;
}

export async function predictReplicate(
  model: string,
  input: any,
  version?: string
): Promise<any> {
  const response = await fetch("/api/replicate/prediction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, version, input }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Prediction failed");
  }

  const prediction = await response.json();
  return prediction;
}

export async function pollPrediction(id: string): Promise<any> {
  const response = await fetch(`/api/replicate/prediction/${id}`);
  if (!response.ok) {
    throw new Error("Polling failed");
  }
  return response.json();
}

export async function generateGemini(
  prompt: string, 
  imageBase64: string, 
  model: string = "gemini-1.5-flash", 
  resolution?: string,
  additionalImagesBase64: string[] = []
): Promise<any> {
  // Remove data:image/png;base64, prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const additionalBase64Data = additionalImagesBase64.map(img => img.replace(/^data:image\/\w+;base64,/, ""));

  const response = await fetch("/api/gemini/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image: base64Data, model, resolution, additionalImages: additionalBase64Data }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Gemini generation failed");
  }

  return response.json();
}
