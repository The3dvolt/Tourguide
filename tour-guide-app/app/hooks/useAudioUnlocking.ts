import { useState, useRef, useCallback } from 'react';

export function useAudioUnlocking() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const unlockAudio = useCallback(async () => {
    try {
      // Create a new AudioContext - this must happen on user interaction
      // Using 24kHz sample rate to match Gemini Live API output
      const context = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = context;

      // Resume the context (required for mobile browsers)
      if (context.state === 'suspended') {
        await context.resume();
      }

      // Create a silent buffer to unlock audio on mobile
      const buffer = context.createBuffer(1, 1, 24000);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(0);

      setIsUnlocked(true);
      console.log('Audio context unlocked successfully');
      
      return true;
    } catch (error) {
      console.error('Failed to unlock audio context:', error);
      setIsUnlocked(false);
      return false;
    }
  }, []);

  const getAudioContext = useCallback(() => {
    return audioContextRef.current;
  }, []);

  return {
    isUnlocked,
    unlockAudio,
    getAudioContext,
  };
}
