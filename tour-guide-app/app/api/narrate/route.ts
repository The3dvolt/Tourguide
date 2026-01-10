import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

export async function POST(req: Request) {
  let context: any = null;
  try {
    const body = await req.json();
    context = body.locationContext;
    const { pois } = body;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      ROLE: Professional AI Tour Guide.
      LOCATION: ${context?.fullAddress} (Street: ${context?.street}, City: ${context?.city}).
      MARKERS: ${JSON.stringify(pois)}.
      
      TASK: 
      1. If markers like "Vintage Wings" exist, tell their specific story first.
      2. If markers are empty, use your internal archives to talk about the history of ${context?.street} and ${context?.city}.
      3. Talk about the industrial heritage, architectural style, and local news archives of ${context?.state}.
      4. NEVER say you have no info. Provide 3 fascinating paragraphs.
    `;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });
  } catch (error) {
    return NextResponse.json({ text: `Welcome to ${context?.city || 'this area'}. This region's history is deeply intertwined with the development of the province, from its early industrial roots to its modern cultural significance...` });
  }
}