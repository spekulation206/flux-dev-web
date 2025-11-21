import { NextResponse } from "next/server";

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
    return NextResponse.json(prediction);
  } catch (error) {
    console.error("Replicate API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

