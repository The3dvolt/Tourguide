// ============================================
// FILE: app/api/voice/route.ts
// Create new file
// ============================================
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    
    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    
    // Use Google Cloud Text-to-Speech (FREE tier: 0-4M chars/month)
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Journey-F', // Natural female voice for tour guide
            ssmlGender: 'FEMALE'
          },
          audioConfig: {
            audioEncoding: 'MP3',
            pitch: 0,
            speakingRate: 1.0
          }
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Google TTS error:', error);
      throw new Error('Google TTS failed');
    }
    
    const data = await response.json();
    
    // Google returns base64 encoded audio
    const audioBuffer = Buffer.from(data.audioContent, 'base64');
    
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      }
    });
    
  } catch (error) {
    console.error('Voice generation error:', error);
    return NextResponse.json({ error: 'Voice generation failed' }, { status: 500 });
  }
}
