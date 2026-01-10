import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) return NextResponse.json({ text: "Missing API Key" }, { status: 401 });

    // FORCE STABLE V1 ENDPOINT
    const genAI = new GoogleGenerativeAI(activeKey);
    
    // Explicitly use the 'models/' prefix to ensure the URL is built correctly
    const modelName = model?.includes("2.0") ? "models/gemini-2.0-flash-exp" : "models/gemini-1.5-flash";
    
    const genModel = genAI.getGenerativeModel(
      { model: modelName },
      { apiVersion: 'v1' } // This forces the SDK out of v1beta
    );

    const landmarkInfo = pois?.length > 0 
      ? pois.map((p: any) => p.name).join(", ") 
      : "the local area";

    const prompt = `You are a professional local historian. Narrate a 2-sentence story about ${landmarkInfo} in ${locationContext?.street || 'this area'}.`;

    const result = await genModel.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ 
      text: "The archive is currently unreachable.", 
      details: error.message 
    }, { status: 500 });
  }
}