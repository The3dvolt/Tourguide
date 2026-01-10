import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { pois, locationContext, interests } = await req.json();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are an expert AI Tour Guide. The user is at: ${locationContext.fullAddress}.
      Current Street/Neighborhood: ${locationContext.street}.
      City: ${locationContext.city}. State/Province: ${locationContext.state}.

      INSTRUCTIONS:
      - NEVER say "I don't have info." 
      - If no landmarks (POIs) are provided, talk about the history of ${locationContext.street} and the architectural style of ${locationContext.city}.
      - Look into your internal records for news archives, historical events, or the industrial heritage of this specific sector.
      - Talk about the typical stores and the "vibe" of this neighborhood.
      - Mention ${locationContext.state}'s general historical significance.
      - Be a storyteller. If you detect markers: ${JSON.stringify(pois)}, include them.
      - Focus on interests: ${interests.join(", ")}.
    `;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });
  } catch (error) {
    return NextResponse.json({ text: "I'm looking at the history of " + locationContext?.city + " right now. This area has deep roots..." });
  }
}