import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) return NextResponse.json({ text: "Missing API Key" }, { status: 401 });

    // CRITICAL FIX: Manually setting the API version to 'v1' (stable)
    const genAI = new GoogleGenerativeAI(activeKey);
    
    // We explicitly call the model by its stable name
    const modelName = model === "gemini-2.0-flash-exp" ? "gemini-2.0-flash-exp" : "gemini-1.5-flash";
    
    // Use the v1 stable endpoint configuration
    const genModel = genAI.getGenerativeModel(
      { model: modelName },
      { apiVersion: 'v1' } 
    );

    const subjects = pois && pois.length > 0 
      ? pois.map((p: any) => p.name).join(", ") 
      : "the local streets";

    const prompt = `You are a local historian. Narrate a 2-sentence story about ${subjects} in ${locationContext?.street || 'this area'}.`;

    const result = await genModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ text });

  } catch (error: any) {
    console.error("Gemini Error:", error);
    return NextResponse.json({ 
      text: "The archive is currently unreachable.", 
      details: error.message 
    }, { status: 500 });
  }
}