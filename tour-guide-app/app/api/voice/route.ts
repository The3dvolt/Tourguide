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
    const { text, voiceId } = await req.json();
    
    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    
    // Default to VITS (Jenny) if no voice provided or if it's not a known VITS voice
    const modelId = (voiceId && voiceId.startsWith('Xenova/')) ? voiceId : 'Xenova/vits-ljs';

    if (!vitsPipelines.has(modelId)) {
      // Load the model if not cached (this might take a moment on first run)
      vitsPipelines.set(modelId, await pipeline('text-to-speech', modelId, { quantized: false }));
    }
    
    const synthesizer = vitsPipelines.get(modelId);
    const output = await synthesizer(text);
    
    // Convert Float32Array to WAV
    const wav = new WaveFile();
    wav.fromScratch(1, output.sampling_rate, '32f', output.audio);
    const buffer = Buffer.from(wav.toBuffer());

    return new NextResponse(buffer, {
      headers: { 'Content-Type': 'audio/wav' }
    });
    
  } catch (error) {
    console.error('Voice generation error:', error);
    return NextResponse.json({ error: 'Voice generation failed' }, { status: 500 });
  }
}
