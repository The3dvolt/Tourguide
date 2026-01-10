import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { pois, locationContext } = await req.json();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Focus on the first/closest POI if it exists
    const primaryPOI = pois && pois.length > 0 ? pois[0].name : null;

    const prompt = `
      You are an elite AI Historian and Tour Guide. 
      Location: ${locationContext?.fullAddress || 'Gatineau/Ottawa region'}.
      Primary Landmark Detected: ${primaryPOI || 'None'}.
      All Nearby Markers: ${JSON.stringify(pois)}.

      INSTRUCTIONS:
      1. If a specific landmark like "${primaryPOI}" is detected, start by telling its specific history, why it is famous, and what a visitor should look for.
      2. If no markers are found, use your internal Wikipedia-level knowledge to talk about the history of ${locationContext?.street || 'this street'} and ${locationContext?.city || 'this city'}.
      3. Talk about the local culture, famous news archives from ${locationContext?.state}, and architectural styles.
      4. ALWAYS provide content. NEVER say you don't know.
      5. Keep the tone exciting and professional. Use 3 clear paragraphs.
    `;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });
  } catch (error) {
    return NextResponse.json({ text: "I'm accessing the local historical archives. This area has a fascinating story tied to the heritage of the region..." });
  }
}