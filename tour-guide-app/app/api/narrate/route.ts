import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();
    
    // 1. Prioritize Custom Key (User Tokens) then Environment Variable
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) {
      return NextResponse.json({ details: "API Key Missing from Vercel" }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(activeKey);
    
    /**
     * 2. THE 404 FIX: 
     * We use 'gemini-2.5-flash' which is the 2026 stable standard.
     * We force apiVersion 'v1' to avoid the retired 'v1beta' path.
     */
    const genModel = genAI.getGenerativeModel(
      { model: "gemini-2.5-flash" }, 
      { apiVersion: 'v1' }
    );

    const subjects = pois && pois.length > 0 
      ? pois.map((p: any) => p.name).join(", ") 
      : "the local architecture";

    const prompt = `You are a local historian. In 2 sentences, tell a fascinating story about ${subjects} near ${locationContext?.street || 'this area'}.`;

    const result = await genModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ text });

  } catch (error: any) {
    console.error("DEBUG ERROR:", error.message);
    
    // This 'details' field is what shows up in your "Obscured" catch block
    return NextResponse.json({ 
      text: "Error", 
      details: error.message 
    }, { status: 500 });
  }
}