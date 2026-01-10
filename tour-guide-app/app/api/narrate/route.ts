import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) return NextResponse.json({ text: "API Key missing" }, { status: 401 });

    const genAI = new GoogleGenerativeAI(activeKey);
    
    // UPDATED MODEL NAMES (Avoids 404 Retired Model Errors)
    let modelPath = "models/gemini-2.5-flash"; // The current workhorse stable model
    
    if (model === "gemini-3-flash") {
      modelPath = "models/gemini-3-flash-preview"; // Fast and smarter
    } else if (model?.includes("pro")) {
      modelPath = "models/gemini-2.5-pro"; // For complex reasoning
    }

    const genModel = genAI.getGenerativeModel({ model: modelPath });

    const landmarkInfo = pois && pois.length > 0 
      ? pois.map((p: any) => p.name).join(", ") 
      : "the local area";

    const prompt = `You are a professional local historian. Narrate a 2-sentence story about ${landmarkInfo} in ${locationContext?.street || 'this area'}.`;

    const result = await genModel.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ text });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ 
      text: "The archive is currently unreachable.", 
      details: error.message 
    }, { status: 500 });
  }
}