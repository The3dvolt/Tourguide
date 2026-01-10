import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();

    // Priority: 1. User's Personal Key -> 2. Server's Vercel Key
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) {
      return NextResponse.json({ text: "API Uplink missing. Enter a Personal Key." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(activeKey);
    
    // Default to 2.5 Flash if none selected; ensure 'models/' prefix
    const modelPath = model?.includes('models/') ? model : `models/${model || 'gemini-2.5-flash'}`;
    
    const genModel = genAI.getGenerativeModel(
      { model: modelPath },
      { apiVersion: 'v1' } 
    );

    const subjects = pois?.length > 0 
      ? pois.slice(0, 3).map((p: any) => p.name).join(", ") 
      : "the local landscape";

    const prompt = `You are a professional local historian. Tell a fascinating 2-sentence story about ${subjects} in ${locationContext?.street || 'this area'}. Speak directly to the traveler.`;

    const result = await genModel.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ text });
  } catch (error: any) {
    console.error("Narrate Error:", error);
    return NextResponse.json({ 
      text: "The historical archive is currently obscured.", 
      details: error.message 
    }, { status: 500 });
  }
}