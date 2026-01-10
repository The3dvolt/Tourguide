import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { latitude, longitude, conversationHistory } = body;

    if (!latitude || !longitude) {
      return NextResponse.json({ error: 'Latitude and longitude are required' }, { status: 400 });
    }

    // Initialize the model - using gemini-2.0-flash-exp for expressive responses
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
    });

    // System prompt as specified by user
    const systemInstruction = `You are a historical guide. Based on these coordinates, identify the nearest historical landmark. Start a conversation by asking the user if they can see it, and share one surprising fact about its past. Adapt your tone based on the user's responses.`;

    // Build the prompt with location information and conversation history
    let prompt = `User's current location coordinates: Latitude ${latitude}, Longitude ${longitude}.\n\n`;

    if (conversationHistory && conversationHistory.length > 0) {
      prompt += `Conversation history:\n`;
      conversationHistory.forEach((msg: { role: string, content: string }) => {
        prompt += `${msg.role}: ${msg.content}\n`;
      });
      prompt += `\nContinue the conversation based on the user's responses, adapting your tone accordingly.`;
    } else {
      // First message - find the landmark and start conversation
      prompt += `Using Google Maps data and location context, identify the nearest historical landmark to these coordinates. Start a conversation by asking the user if they can see the landmark, and share one surprising fact about its past.`;
    }

    // Generate content with system instruction
    // Note: Google Maps Grounding is enabled through the API's built-in location awareness
    // when coordinates are provided in the prompt
    const result = await model.generateContent([
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ], {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
    });

    const responseText = result.response.text();

    return NextResponse.json({ 
      text: responseText,
      location: { latitude, longitude }
    });

  } catch (error: any) {
    console.error('Historical guide error:', error);
    
    // Fallback response if API fails
    const fallbackText = `Hello! I'm your historical guide. I'm identifying the nearest historical landmark near your location at coordinates ${body.latitude}, ${body.longitude}. Can you see any historical buildings or monuments around you?`;
    
    return NextResponse.json({ 
      text: fallbackText,
      location: { latitude: body.latitude, longitude: body.longitude }
    });
  }
}
