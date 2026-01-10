import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pois, locationContext } = body;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ text: "API Key missing", details: "Key not found in Vercel Env" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Validate that we actually have data to send to Gemini
    if (!locationContext && (!pois || pois.length === 0)) {
       return NextResponse.json({ text: "No location data", details: "Phone sent empty GPS context" }, { status: 400 });
    }

    const prompt = `Historian guide. Location: ${locationContext?.city}. Landmarks: ${pois?.map((p:any) => p.name).join(', ')}. 2 sentences of history.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ text });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ 
      text: "Archive Error", 
      details: error.message // This sends the real error to your phone!
    }, { status: 500 });
  }
}