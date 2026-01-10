import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

export async function POST(req: Request) {
  let locationContext: any = null;
  try {
    const body = await req.json();
    const { pois, interests } = body;
    locationContext = body.locationContext;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are an expert AI Tour Guide. Current Location: ${locationContext?.fullAddress}.
      Hierarchy: Street: ${locationContext?.street}, City: ${locationContext?.city}, Province: ${locationContext?.state}, Country: ${locationContext?.country}.
      Nearby Landmarks: ${JSON.stringify(pois)}
      Interests: ${interests?.join(", ")}

      CRITICAL INSTRUCTIONS:
      1. NEVER say you have no information. 
      2. FOLLOW THIS HIERARCHY:
         - If POIs exist, talk about them.
         - If no POIs, talk about the history/vibe of the STREET (${locationContext?.street}).
         - If the street is quiet, talk about the CITY (${locationContext?.city}) history, archives, and famous news.
         - If you need more, talk about the PROVINCE (${locationContext?.state}) and COUNTRY (${locationContext?.country}).
      3. Use your internal training data (like Wikipedia knowledge) to provide deep historical context.
      4. Keep the tone conversational and professional.
    `;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });
  } catch (error) {
    return NextResponse.json({ text: `Welcome to ${locationContext?.city || 'this area'}. This region has a deep history spanning centuries, from its industrial roots to its modern culture...` });
  }
}