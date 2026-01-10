import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) return NextResponse.json({ text: "Missing API Key" }, { status: 401 });

    const genAI = new GoogleGenerativeAI(activeKey);
    
    // FIX: Explicitly target the stable model version
    const modelToUse = model === "gemini-2.0-flash-exp" ? "gemini-2.0-flash-exp" : "gemini-1.5-flash";
    const genModel = genAI.getGenerativeModel({ model: modelToUse });

    const landmarkInfo = pois.length > 0 
      ? `nearby landmarks: ${pois.map((p: any) => p.name).join(", ")}` 
      : "the general history of the area";

    const prompt = `You are a local historian. Tell a 2-sentence story about ${landmarkInfo} at ${locationContext.street}, ${locationContext.city}.`;

    const result = await genModel.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });

  } catch (error: any) {
    // Return actual error details to the debug window
    return NextResponse.json({ 
      text: "Archive unreachable.", 
      details: error.message 
    }, { status: 500 });
  }
}