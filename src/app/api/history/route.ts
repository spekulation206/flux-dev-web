import { NextResponse } from "next/server";
import { getPrompts, savePrompt } from "@/lib/history";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get("section");

  if (!section) {
    return NextResponse.json({ error: "Section parameter is required" }, { status: 400 });
  }

  const prompts = await getPrompts(section);
  return NextResponse.json({ prompts });
}

export async function POST(request: Request) {
  try {
    const { section, prompt } = await request.json();

    if (!section || !prompt) {
      return NextResponse.json({ error: "Section and prompt are required" }, { status: 400 });
    }

    await savePrompt(section, prompt);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

