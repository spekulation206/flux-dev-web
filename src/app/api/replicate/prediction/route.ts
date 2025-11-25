import { NextResponse } from "next/server";
import { db, admin } from "@/lib/firestore";
import { getAccessToken } from "@/lib/googlePhotosServer";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { version, input, model } = body;

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "REPLICATE_API_TOKEN not set" }, { status: 500 });
    }

    let url = "https://api.replicate.com/v1/predictions";
    const payload: any = { input };

    if (version) {
      payload.version = version;
    } else if (model) {
      // Expect model to be "owner/name"
      url = `https://api.replicate.com/v1/models/${model}/predictions`;
    }
    
    // Add Webhook
    const host = request.headers.get("host");
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    // If using ngrok locally, host will be the ngrok url
    const webhookUrl = `${protocol}://${host}/api/webhooks/replicate`;
    
    payload.webhook = webhookUrl;
    payload.webhook_events_filter = ["completed"];

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const prediction = await response.json();
    
    // Store context for webhook
    try {
        const accessToken = await getAccessToken();
        if (accessToken) {
            await db.collection("replicate_jobs").doc(prediction.id).set({
                accessToken,
                prompt: input.prompt,
                model: model || version, 
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Stored webhook context for ${prediction.id}`);
        } else {
            console.log("No Google Access Token available for webhook context");
        }
    } catch (e) {
        console.error("Failed to store webhook context", e);
    }

    return NextResponse.json(prediction);
  } catch (error) {
    console.error("Replicate API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
