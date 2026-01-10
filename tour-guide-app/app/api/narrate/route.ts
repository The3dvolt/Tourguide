import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// Initialize Gemini with your API Key from Environment Variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { pois, locationContext } = await req.body.json();

    // 1. Prepare the model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // 2. Build a high-quality prompt for a historian
    const prompt = `
      You are an expert local historian. 
      Current Location: ${locationContext?.street}, ${locationContext?.city}.
      Nearby Points of Interest: ${pois.map((p: any) => p.name).join(", ")}.
      
      Task: Narrate a fascinating historical story (max 3 sentences) about this specific area. 
      Focus on architectural secrets or hidden events. 
      Format: Speak directly to the traveler. Use a natural, engaging tone.
    `;

    // 3. Generate content
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ text: "The history here is deep, but my archives are temporarily unreachable." }, { status: 500 });
  }
}