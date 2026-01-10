import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

export async function POST(req: Request) {
  let locationContext: { fullAddress?: string; street?: string; city?: string; state?: string } | null = null;

  try {
    const body = await req.json();
    const { pois, interests } = body;
    locationContext = body.locationContext;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are an expert AI Tour Guide. The user is at: ${locationContext?.fullAddress || 'their current location'}.
      Current Street: ${locationContext?.street || 'this area'}. City: ${locationContext?.city || 'this city'}.

      INSTRUCTIONS:
      - Tell a story about the local history, architecture, and "vibe" of this specific street and city.
      - If no landmarks exist, use your internal knowledge about ${locationContext?.city} to entertain the user.
      - User interests: ${interests?.join(", ") || 'history and culture'}.
      - Nearby markers: ${JSON.stringify(pois)}.
    `;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });

  } catch (error) {
    const cityName = locationContext?.city || "this area";
    return NextResponse.json({ 
      text: `I'm observing the local history of ${cityName}. It has a fascinating heritage...` 
    });
  }
}