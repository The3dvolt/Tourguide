import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) return NextResponse.json({ text: "API Key missing" }, { status: 401 });

    const genAI = new GoogleGenerativeAI(activeKey);
    
    // Using current 2026 stable model paths
    let modelPath = "models/gemini-2.5-flash"; 
    
    if (model === "gemini-3-flash") {
      modelPath = "models/gemini-3-flash-preview"; 
    } else if (model?.includes("pro")) {
      modelPath = "models/gemini-2.5-pro"; 
    }

    const genModel = genAI.getGenerativeModel({ model: modelPath });

    const landmarkInfo = pois && pois.length > 0 
      ? pois.map((p: any) => p.name).join(", ") 
      : "the general history of this neighborhood";

    // ENHANCED PROMPT: Requests a specific format and a reference link
    const prompt = `
      You are a professional local historian. 
      LOCATION: ${locationContext?.street || 'this area'}, ${locationContext?.city || ''}.
      LANDMARKS: ${landmarkInfo}.

      TASK: 
      1. Provide a unique, fascinating 2-sentence historical fact. 
      2. If this is a repeat request, find a different obscure detail or "hidden secret" about the area.
      3. Provide a real external URL (Wikipedia, local museum, or historical archive) where the user can verify this.

      OUTPUT FORMAT:
      STORY: [Your 2-sentence narration here]
      LINK: [Valid URL here]
    `;

    const result = await genModel.generateContent(prompt);
    const text = result.response.text();

    // We return the raw text to the frontend to be parsed
    return NextResponse.json({ text });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ 
      text: "STORY: The archive is currently unreachable. LINK: https://google.com", 
      details: error.message 
    }, { status: 500 });
  }
}