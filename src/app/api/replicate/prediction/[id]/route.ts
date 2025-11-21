import { NextResponse } from "next/server";
import { calculateReplicateCost } from "@/lib/pricing";
import { recordCost } from "@/lib/billing";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: "REPLICATE_API_TOKEN not set" }, { status: 500 });
  }

  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const prediction = await response.json();

    // Record Cost if succeeded
    if (prediction.status === "succeeded") {
        const modelName = prediction.model || prediction.version || "unknown";
        let cost = 0;
        
        // Check if this is a Kontext model (per-image pricing)
        const isKontextModel = modelName.includes("flux-kontext") || 
                              modelName.includes("qwen-image-edit") || 
                              modelName.includes("seedream-4");
        
        if (isKontextModel) {
          // Use per-image pricing for Kontext models
          cost = calculateReplicateCost(modelName, undefined, true);
        } else if (prediction.metrics?.predict_time) {
          // Use time-based pricing for legacy models
          const predictTime = prediction.metrics.predict_time;
          cost = calculateReplicateCost(modelName, predictTime, false);
        }
        
        if (cost > 0) {
          // Record cost with deduplication
          recordCost("replicate", cost, { 
              predictionId: prediction.id, 
              model: modelName, 
              duration: prediction.metrics?.predict_time,
              pricingType: isKontextModel ? "per-image" : "time-based"
          }, prediction.id).catch(e => console.error("Cost record error", e));
        }
    }

    return NextResponse.json(prediction);
  } catch (error) {
    console.error("Replicate Polling Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

