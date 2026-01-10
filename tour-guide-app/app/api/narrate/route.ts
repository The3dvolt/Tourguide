import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pois, locationContext, model, customKey } = body;

    const activeKey = customKey || process.env.GEMINI_API_KEY;
    if (!activeKey) {
      return NextResponse.json({ details: "API Key missing. Check Vercel Env or paste your own." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(activeKey);
    const genModel = genAI.getGenerativeModel({ model: model || "gemini-1.5-flash" });

    // Ensure we have a string to talk about, even if POIs are empty
    const subjects = pois && pois.length > 0 
      ? pois.slice(0, 3).map((p: any) => p.name).join(", ") 
      : "the local streets and atmosphere";

    const prompt = `You are a local historian. Tell a fascinating 2-sentence story about ${subjects} in ${locationContext?.street || 'this area'}. Speak directly to the traveler.`;

    const result = await genModel.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ text });
  } catch (error: any) {
    console.error("Narrate Crash:", error);
    // ALWAYS return JSON, even on error
    return NextResponse.json({ 
      text: "The archives are quiet right now.", 
      details: error.message 
    }, { status: 500 });
  }
}