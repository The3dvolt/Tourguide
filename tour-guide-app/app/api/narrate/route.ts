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
      You are an expert AI Tour Guide. The user is at: ${locationContext?.fullAddress || 'their current location'}.
      Current Street/Neighborhood: ${locationContext?.street || 'this area'}.
      City: ${locationContext?.city || 'the local city'}. State/Province: ${locationContext?.state || 'the region'}.

      INSTRUCTIONS:
      - NEVER say "I don't have info." 
      - If no landmarks (POIs) are provided, talk about the history of ${locationContext?.street || 'the area'} and the architectural style of ${locationContext?.city || 'the city'}.
      - Look into your internal records for news archives, historical events, or the industrial heritage of this specific sector.
      - Talk about the typical stores and the "vibe" of this neighborhood.
      - Mention ${locationContext?.state || 'the province'}'s general historical significance.
      - Be a storyteller. If you detect markers: ${JSON.stringify(pois)}, include them.
      - Focus on interests: ${interests?.join(", ") || 'local culture'}.
    `;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ text: result.response.text() });

  } catch (error) {
    console.error("Narration error:", error);
    const cityName = locationContext?.city || "this city";
    return NextResponse.json({ 
      text: `I'm currently observing the surroundings in ${cityName}. It's a fascinating area with a rich local history that I'm excited to share with you...`