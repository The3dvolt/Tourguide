import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();

    // 1. Check for User Key first, then fall back to Server Key
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) {
      return NextResponse.json({ text: "No active Uplink found. Please enter an API Key." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(activeKey);
    
    // 2. Use the modern 2.5/3.0 model paths to avoid 404s
    const modelPath = model || "models/gemini-2.5-flash"; 
    
    const genModel = genAI.getGenerativeModel(
      { model: modelPath },
      { apiVersion: 'v1' } 
    );

    const prompt = `You are a local historian. Narrate a 2-sentence story about ${pois[0]?.name || 'this area'} in ${locationContext?.city || 'this city'}.`;

    const result = await genModel.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });

  } catch (error: any) {
    // If we hit a 429, tell the user clearly
    if (error.message.includes("429")) {
      return NextResponse.json({ 
        text: "Uplink saturated. Please wait 60 seconds or use a Personal API Key.",
        details: error.message 
      }, { status: 429 });
    }
    return NextResponse.json({ text: "Archive error.", details: error.message }, { status: 500 });
  }
}