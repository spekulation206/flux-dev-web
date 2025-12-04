import { NextResponse } from "next/server";
import { calculateGeminiCost } from "@/lib/pricing";
import { recordCost } from "@/lib/billing";
import { getAccessToken, uploadBufferToGooglePhotos } from "@/lib/googlePhotosServer";

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { prompt, image, model, resolution, aspectRatio, additionalImages } = body;

    // Default to a stable model if not provided
    const targetModel = model || "gemini-2.5-flash-image";
    
    let finalPrompt = prompt;
    if (targetModel === "gemini-3-pro-image-preview" && resolution) {
       finalPrompt = `${prompt}\n\nOutput Resolution: ${resolution}`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

    // Configure image generation options for Nano Banana / Nano Banana Pro
    // See: https://ai.google.dev/gemini-api/docs/image-generation
    const generationConfig: any = {};

    // Force image-only responses for image models
    if (targetModel === "gemini-2.5-flash-image" || targetModel === "gemini-3-pro-image-preview") {
      generationConfig.responseModalities = ["IMAGE"];
      generationConfig.imageConfig = {};

      // Aspect ratio is optional – default behavior if omitted is 1:1
      if (aspectRatio && typeof aspectRatio === "string") {
        generationConfig.imageConfig.aspectRatio = aspectRatio;
      }

      // Only Gemini 3 Pro Image Preview supports 1K / 2K / 4K output
      if (
        targetModel === "gemini-3-pro-image-preview" &&
        typeof resolution === "string" &&
        ["1K", "2K", "4K"].includes(resolution.toUpperCase())
      ) {
        generationConfig.imageConfig.imageSize = resolution.toUpperCase();
      }

      // Clean up empty imageConfig if nothing was set
      if (Object.keys(generationConfig.imageConfig).length === 0) {
        delete generationConfig.imageConfig;
      }

      if (Object.keys(generationConfig).length === 0) {
        // No-op, do not attach empty config
      }
    }

    const parts = [
      { text: finalPrompt },
      {
        inline_data: {
          mime_type: "image/png",
          data: image,
        },
      },
    ];

    // Add additional images if present
    if (additionalImages && Array.isArray(additionalImages)) {
      additionalImages.forEach((imgData: string) => {
        parts.push({
          inline_data: {
            mime_type: "image/png",
            data: imgData,
          },
        });
      });
    }

    const payload: any = {
      contents: [
        {
          role: "user",
          parts: parts,
        },
      ],
    };

    if (Object.keys(generationConfig).length > 0) {
      payload.generationConfig = generationConfig;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const data = await response.json();
    
    // Record Cost
    // For image models (Nano Banana, Nano Banana Pro), use per-image pricing
    // For legacy models, use token-based pricing if usageMetadata is available
    let cost = 0;
    if (targetModel === "gemini-2.5-flash-image" || targetModel === "gemini-3-pro-image-preview") {
      // Per-image pricing for Kontext models
      cost = calculateGeminiCost(targetModel, undefined, undefined, resolution);
    } else if (data.usageMetadata) {
      // Token-based pricing for legacy models
      const inputTokens = data.usageMetadata.promptTokenCount || 0;
      const outputTokens = data.usageMetadata.candidatesTokenCount || 0;
      cost = calculateGeminiCost(targetModel, inputTokens, outputTokens);
    }
    
    if (cost > 0) {
      // Fire and forget cost recording
      recordCost("gemini", cost, { 
        model: targetModel, 
        resolution: resolution || undefined,
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount
      }).catch(e => console.error("Cost record error", e));
    }

    // Log helpful info if no candidates/parts for debugging
    if (!data.candidates?.[0]?.content?.parts) {
      console.warn("Gemini API: No parts in response", JSON.stringify(data, null, 2));
    } else {
      // Check if ANY part is an image (handle both snake_case and camelCase)
      // We map to find the first image part, ignoring text parts if an image exists
      const imagePart = data.candidates[0].content.parts.find(
        (p: any) => (p.inline_data?.mime_type?.startsWith("image/") || p.inlineData?.mimeType?.startsWith("image/"))
      );
      
      if (imagePart) {
        const inlineData = imagePart.inline_data || imagePart.inlineData;
        console.log(`Gemini Success: Generated image (${inlineData.mime_type || inlineData.mimeType}, size: ${inlineData.data.length} chars)`);
        
        // Auto-save to Google Photos (Server Side)
        try {
          const accessToken = await getAccessToken();
          if (accessToken) {
            const imageBuffer = Buffer.from(inlineData.data, "base64");
            const description = `Generated by Gemini (${targetModel})\nPrompt: ${prompt}`;
            // Fire and forget upload or await it? Await to ensure it happens before lambda dies, 
            // but don't block response if it takes too long? 
            // Since Cloud Run can handle it, we await it to be safe.
            await uploadBufferToGooglePhotos(
              accessToken,
              imageBuffer,
              `gemini_gen_${Date.now()}.png`,
              description
            );
            console.log("Server-side auto-save to Google Photos successful");
          } else {
             console.log("No Google Access Token available for server-side upload");
          }
        } catch (e) {
          console.error("Server-side Google Photos upload failed", e);
          // Don't fail the request, just log
        }

      } else {
        console.warn("Gemini Response (No Image Found):", JSON.stringify(data, null, 2));
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
