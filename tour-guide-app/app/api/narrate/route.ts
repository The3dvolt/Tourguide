import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

// Match the name you set in Vercel: GOOGLE_AI_API_KEY
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

export async function POST(req: Request) {
  let locationContext: any = null;

  try {
    const body = await req.json();
    const { pois, interests, heading } = body;
    locationContext = body.locationContext;

    // Use Gemini 1.5 Flash for the tour guide narration
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are "3D Volt," an expert AI Tour Guide. 
      
      LOCATION CONTEXT:
      - Address: ${locationContext?.fullAddress || 'Unknown'}
      - Street: ${locationContext?.street || 'this street'}
      - City: ${locationContext?.city || 'this city'}
      - Province: ${locationContext?.state || 'this province'}
      - Heading: ${heading ? Math.round(heading) : 0}°
      
      NEARBY MARKERS:
      ${pois && pois.length > 0 ? JSON.stringify(pois) : "None detected."}

      INSTRUCTIONS:
      1. NEVER say you lack information.
      2. If markers are empty, use your internal training data to talk about the history of the STREET (${locationContext?.street}).
      3. If the street is obscure, talk about the CITY (${locationContext?.city}) history, local news archives, and its industrial/cultural heritage.
      4. Talk about the architectural vibe and the province of ${locationContext?.state}.
      5. Interests: ${interests?.join(", ") || "local history"}.
      6. Provide 3 engaging paragraphs suitable for voice narration.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ text });

  } catch (error: any) {
    console.error("Narration Error:", error);
    const cityName = locationContext?.city || "this city";
    return NextResponse.json({ 
      text: `Welcome to ${cityName}. I am currently analyzing the local archives to bring you the best stories. This area has a fascinating heritage, from its early settlement to its modern-day character.`
    });
  }
}