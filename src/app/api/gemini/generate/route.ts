import { NextResponse } from "next/server";
import { calculateGeminiCost } from "@/lib/pricing";
import { recordCost } from "@/lib/billing";

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { prompt, image, model, resolution } = body;

    // Default to a stable model if not provided
    const targetModel = model || "gemini-2.5-flash-image";
    
    let finalPrompt = prompt;
    if (targetModel === "gemini-3-pro-image-preview" && resolution) {
       finalPrompt = `${prompt}\n\nOutput Resolution: ${resolution}`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: finalPrompt },
            {
              inline_data: {
                mime_type: "image/png",
                data: image,
              },
            },
          ],
        },
      ],
    };

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
        
        // OPTIONAL: We could strip the text parts here to clean up the response for the client,
        // but the client is also updated to prioritize the image.
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

