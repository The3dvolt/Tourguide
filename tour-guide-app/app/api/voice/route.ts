// ============================================
// FILE: app/api/voice/route.ts
// Create new file
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { pipeline } from '@xenova/transformers';
import { WaveFile } from 'wavefile';

// Global cache for VITS pipelines to prevent reloading on every request
const vitsPipelines = new Map();

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId, ssmlGender, customKey } = await req.json();
    
    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    
    // Check if it's a VITS/Piper voice (hosted on HuggingFace)
    if (voiceId && voiceId.startsWith('Xenova/')) {
      if (!vitsPipelines.has(voiceId)) {
        // Load the model if not cached (this might take a moment on first run)
        vitsPipelines.set(voiceId, await pipeline('text-to-speech', voiceId, { quantized: false }));
      }
      
      const synthesizer = vitsPipelines.get(voiceId);
      const output = await synthesizer(text);
      
      // Convert Float32Array to WAV
      const wav = new WaveFile();
      wav.fromScratch(1, output.sampling_rate, '32f', output.audio);
      const buffer = Buffer.from(wav.toBuffer());

      return new NextResponse(buffer, {
        headers: { 'Content-Type': 'audio/wav' }
      });
    }

    const apiKey = customKey || process.env.GOOGLE_AI_API_KEY;

    // Use Google Cloud Text-to-Speech (FREE tier: 0-4M chars/month)
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'en-US',
            name: voiceId || 'en-US-Journey-F', // Default to Journey (Gemini-like)
            ssmlGender: ssmlGender || 'FEMALE'
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
