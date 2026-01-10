import { NextRequest, NextResponse } from 'next/server';

// This route provides the API key for client-side WebSocket connection
// In production, consider using a more secure approach like session tokens
export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Return the API key for client-side WebSocket connection
    // Note: In production, consider implementing token-based authentication
    return NextResponse.json({ apiKey });
  } catch (error) {
    console.error('Error in gemini-live route:', error);
    return NextResponse.json({ error: 'Failed to get API key' }, { status: 500 });
  }
}