import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { pois, locationContext } = await req.json();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are an expert historian. Location: ${locationContext?.fullAddress || 'this area'}.
      City: ${locationContext?.city || 'Gatineau'}, Street: ${locationContext?.street || 'the local street'}.

      RULES:
      1. NEVER say "I have no information."
      2. If no landmarks are provided in this list: ${JSON.stringify(pois)}, use your internal knowledge about the history of ${locationContext?.city} and ${locationContext?.state}.
      3. Tell a story about the street names, the neighborhood's origins, and any famous news archives or events in this province.
      4. Talk like a professional tour guide. Keep it to 3 paragraphs.
    `;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });
  } catch (error) {
    return NextResponse.json({ text: "I'm currently exploring the historical archives of this region. It has a fascinating heritage." });
  }
}