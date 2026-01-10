import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) return NextResponse.json({ text: "Missing API Key" }, { status: 401 });

    const genAI = new GoogleGenerativeAI(activeKey);
    
    // FIX: Using the '-latest' or '-002' suffix forces the SDK to find the correct endpoint
    let modelName = "gemini-1.5-flash-latest"; 
    
    if (model === "gemini-2.0-flash-exp") {
      modelName = "gemini-2.0-flash-exp";
    } else if (model === "gemini-1.5-pro") {
      modelName = "gemini-1.5-pro-latest";
    }

    const genModel = genAI.getGenerativeModel({ model: modelName });

    // Build the story context
    const subjects = pois && pois.length > 0 
      ? pois.map((p: any) => p.name).join(", ") 
      : "the local area";

    const prompt = `You are a local historian. Tell a fascinating 2-sentence story about ${subjects} near ${locationContext?.street || 'this location'}. Speak directly to the traveler.`;

    const result = await genModel.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ text });

  } catch (error: any) {
    console.error("Narrate Error:", error);
    return NextResponse.json({ 
      text: "The archive is currently unreachable.", 
      details: error.message 
    }, { status: 500 });
  }
}