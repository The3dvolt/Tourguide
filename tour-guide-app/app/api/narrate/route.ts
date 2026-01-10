import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { pois, locationContext, userEmail } = await req.json();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      CONTEXT: You are a high-end AI historian for the 3D Volt Tour app.
      LOCATION: ${locationContext.fullAddress} (Street: ${locationContext.street}, City: ${locationContext.city}).
      MARKERS DETECTED: ${JSON.stringify(pois)}.

      TASK:
      1. If specific markers like "Vintage Wings of Canada" are detected, provide a deep, 3-paragraph history of that specific place.
      2. If NO markers are detected, use your internal Wikipedia and news archive training to talk about the history of ${locationContext.street} and the city of ${locationContext.city}.
      3. Talk about the architectural style of this neighborhood and any famous news stories from this province.
      4. NEVER say you don't know. Always provide a rich historical narrative.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // OPTIONAL: Save to Database here using userEmail
    // await supabase.from('history').insert({ email: userEmail, story: text, location: locationContext.city });

    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json({ text: "Observing local history..." });
  }
}