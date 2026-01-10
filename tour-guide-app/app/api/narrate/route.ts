import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) return NextResponse.json({ text: "Missing API Key" }, { status: 401 });

    const genAI = new GoogleGenerativeAI(activeKey);
    
    // FIX: Using the absolute 'models/...' prefix 
    // This is the most compatible way to call the API
    let modelPath = "models/gemini-1.5-flash"; 
    
    if (model === "gemini-2.0-flash-exp") {
      modelPath = "models/gemini-2.0-flash-exp";
    } else if (model?.includes("pro")) {
      modelPath = "models/gemini-1.5-pro";
    }

    // Initialize with the explicit path
    const genModel = genAI.getGenerativeModel({ model: modelPath });

    const subjects = pois && pois.length > 0 
      ? pois.map((p: any) => p.name).join(", ") 
      : "the local landscape";

    const prompt = `You are a local historian. Narrate a 2-sentence story about ${subjects} in ${locationContext?.street || 'this area'}.`;

    const result = await genModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ text });

  } catch (error: any) {
    console.error("Gemini Error:", error);
    // Return detailed error to help us see if it's still a 404
    return NextResponse.json({ 
      text: "The archive is currently unreachable.", 
      details: error.message 
    }, { status: 500 });
  }
}