'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';

interface POI {
  id: string;
  name: string;
  type: string;
  distance: number;
}

export default function TourGuidePage() {
  const [user, setUser] = useState<any>(null);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [radius, setRadius] = useState(2000);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Syncing GPS...');
  
  const lastFetchedLocation = useRef<{lat: number, lon: number} | null>(null);
  
  // Gemini Live API refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const apiKeyRef = useRef<string | null>(null);

  // --- Auth Logic ---
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = () => {
    supabase.auth.signInWithOAuth({ 
      provider: 'google', 
      options: { redirectTo: window.location.origin } 
    });
  };

  // --- Gemini Live API Voice Integration ---
  useEffect(() => {
    // Get API key on mount
    fetch('/api/gemini-live')
      .then(res => res.json())
      .then(data => {
        if (data.apiKey) {
          apiKeyRef.current = data.apiKey;
        }
      })
      .catch(err => console.error('Failed to get API key:', err));

    return () => {
      // Cleanup on unmount
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  const connectGeminiLive = async () => {
    if (!apiKeyRef.current) {
      console.error('API key not available');
      return;
    }

    try {
      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close();
      }

      // Gemini Live API WebSocket endpoint
      // Note: This is the typical pattern for Gemini Live API
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService/BidiGenerateContent?key=${apiKeyRef.current}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Gemini Live WebSocket connected');
        
        // Send initial configuration with natural/expressive voice
        const configMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generation_config: {
              response_modalities: ['AUDIO'],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: {
                    voice_name: 'Aoede' // Natural expressive voice
                  }
                }
              }
            },
            tools: [],
            system_instruction: {
              parts: [{
                text: `You are a professional AI Tour Guide. Provide engaging, natural, and expressive narration about locations, history, and points of interest.`
              }]
            }
          }
        };

        ws.send(JSON.stringify(configMessage));

        // Start audio capture
        startAudioCapture();
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Handle audio response
          if (message.serverContent && message.serverContent.modelTurn) {
            const modelTurn = message.serverContent.modelTurn;
            
            // Check for audio data
            if (modelTurn.parts) {
              for (const part of modelTurn.parts) {
                if (part.inlineData && part.inlineData.mimeType === 'audio/pcm') {
                  // Decode base64 audio data
                  const audioData = atob(part.inlineData.data);
                  const audioBuffer = new ArrayBuffer(audioData.length);
                  const view = new Uint8Array(audioBuffer);
                  for (let i = 0; i < audioData.length; i++) {
                    view[i] = audioData.charCodeAt(i);
                  }
                  
                  // Play audio
                  await playAudioBuffer(audioBuffer);
                } else if (part.text) {
                  // Update narration text if text is included
                  setCurrentNarration(part.text);
                }
              }
            }
          }

          // Handle setup complete
          if (message.setupComplete) {
            console.log('Gemini Live setup complete');
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        wsRef.current = null;
      };

    } catch (error) {
      console.error('Failed to connect to Gemini Live:', error);
    }
  };

  // Helper function to convert binary data to base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192; // Process in chunks to avoid stack overflow
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  };

  const startAudioCapture = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      mediaStreamRef.current = stream;

      // Create audio context with 16kHz sample rate for input
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      
      // Create script processor for audio chunks (4096 buffer size)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const inputData = event.inputBuffer.getChannelData(0);
          
          // Convert Float32Array to 16-bit PCM (little-endian)
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }

          // Send audio chunk to Gemini (using base64 encoding)
          const message = {
            request: {
              contents: [{
                parts: [{
                  inlineData: {
                    mimeType: 'audio/pcm',
                    data: arrayBufferToBase64(pcmData.buffer)
                  }
                }]
              }]
            }
          };

          wsRef.current.send(JSON.stringify(message));
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const playAudioBuffer = async (audioBuffer: ArrayBuffer) => {
    try {
      // Create audio context for playback (24kHz for Gemini output)
      const playbackContext = new AudioContext({ sampleRate: 24000 });
      
      // Convert PCM16 to AudioBuffer
      const pcmData = new Int16Array(audioBuffer);
      const floatData = new Float32Array(pcmData.length);
      
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 32768.0;
      }

      const buffer = playbackContext.createBuffer(1, floatData.length, 24000);
      buffer.copyToChannel(floatData, 0);

      const source = playbackContext.createBufferSource();
      source.buffer = buffer;
      source.connect(playbackContext.destination);
      
      isPlayingRef.current = true;
      source.onended = () => {
        isPlayingRef.current = false;
        playbackContext.close();
      };
      
      source.start(0);
    } catch (error) {
      console.error('Error playing audio:', error);
      isPlayingRef.current = false;
    }
  };

  const disconnectGeminiLive = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
  };

  const speakText = async (text: string) => {
    if (!voiceEnabled) return;
    
    // Connect and send text as initial message if not already connected
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connectGeminiLive();
      // Wait a bit for connection to establish
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Send text message to Gemini for voice response
      const message = {
        request: {
          contents: [{
            parts: [{
              text: text
            }]
          }]
        }
      };
      wsRef.current.send(JSON.stringify(message));
    }
  };

  // --- Historical Guide Function ---
  const getHistoricalGuide = async (lat: number, lon: number, conversationHistory?: Array<{role: string, content: string}>) => {
    try {
      const res = await fetch('/api/historical-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          latitude: lat, 
          longitude: lon,
          conversationHistory: conversationHistory || []
        })
      });
      
      const data = await res.json();
      return data.text || data.error || 'Unable to get historical guide information.';
    } catch (error) {
      console.error('Error calling historical guide:', error);
      return 'I apologize, but I encountered an error while trying to identify the nearest historical landmark.';
    }
  };

  const getDist = (l1: any, l2: any) => {
    const R = 6371e3;
    const dLat = (l2.lat - l1.lat) * Math.PI / 180;
    const dLon = (l2.lon - l1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(l1.lat * Math.PI / 180) * Math.cos(l2.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const newLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      // Stability: Only update markers if moved > 30 meters
      if (!lastFetchedLocation.current || getDist(lastFetchedLocation.current, newLoc) > 30) {
        setLocation(newLoc);
        lastFetchedLocation.current = newLoc;
      }
    }, null, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!location) return;
    fetch('/api/discover', {
      method: 'POST',
      body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
    })
    .then(res => res.json())
    .then(data => {
      setPois(data.pois || []);
      setLocationContext(data.locationContext || null);
      if (data.locationContext) setDebugInfo(`Active: ${data.locationContext.street}`);
    });
  }, [location, radius]);

  // --- AI Trigger ---
  const handleNarrate = async () => {
    if (isNarrating || !locationContext) return;

    setIsNarrating(true);
    setCurrentNarration('Consulting Gemini Flash archives...');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pois, locationContext, interests: ['history', 'architecture'] })
      });
      const data = await res.json();
      setCurrentNarration(data.text);
      if (voiceEnabled) {
        await speakText(data.text);
      }
    } catch (e) {
      setCurrentNarration("I'm observing the local history of " + locationContext?.city);
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-sans">
      <header className="p-4 bg-slate-900 border-b border-white/10 sticky top-0 z-50">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="font-black text-blue-500 text-xl tracking-tighter italic">3D VOLT TOUR</h1>
            <p className="text-[9px] text-slate-500 uppercase font-bold">{debugInfo}</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { 
                const newState = !voiceEnabled;
                setVoiceEnabled(newState);
                if (newState) {
                  connectGeminiLive();
                } else {
                  disconnectGeminiLive();
                }
              }} 
              className={`p-2 rounded-full transition ${voiceEnabled ? 'bg-green-600' : 'bg-slate-800'}`}
            >
              {voiceEnabled ? '🔊' : '🔇'}
            </button>
            {user ? (
              <div className="flex items-center gap-2">
                <img src={user.user_metadata?.avatar_url} className="w-8 h-8 rounded-full border-2 border-blue-500" />
                <button onClick={() => supabase.auth.signOut()} className="text-[10px] font-black text-slate-500 uppercase">Exit</button>
              </div>
            ) : (
              <button onClick={handleLogin} className="bg-blue-600 px-4 py-2 rounded-full text-[10px] font-black uppercase">Login</button>
            )}
          </div>
        </div>
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
          <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-2">
            <span>Radar Range</span>
            <span className="text-blue-400 font-mono">{radius}m</span>
          </div>
          <input type="range" min="100" max="5000" step="100" value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} className="w-full h-1.5 accent-blue-500" />
        </div>
      </header>

      <main className="p-4 flex-1 space-y-4 max-w-lg mx-auto w-full">
        <section className={`p-6 rounded-[2.5rem] border-2 transition-all duration-700 ${isNarrating ? 'border-blue-500 bg-blue-500/5' : 'border-white/5 bg-slate-950'}`}>
           <h3 className="text-[10px] font-black text-slate-600 uppercase mb-4 tracking-widest flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${isNarrating ? 'bg-blue-500 animate-ping' : 'bg-slate-700'}`}></div>
             History Archive
           </h3>
           <p className="text-xl font-medium leading-relaxed text-slate-200">
            {currentNarration || (user ? `Hello ${user.user_metadata?.full_name?.split(' ')[0]}. Press Narrate to explore.` : "Please Login to unlock the AI.")}
           </p>
        </section>

        <button onClick={handleNarrate} disabled={isNarrating || !locationContext} className="w-full py-7 bg-blue-600 rounded-[2.5rem] font-black text-lg tracking-widest shadow-2xl active:scale-95 transition-all">
          {isNarrating ? 'CONSULTING AI...' : 'NARRATE NOW'}
        </button>

        <div className="space-y-3">
          {pois.slice(0, 3).map((poi) => (
            <div key={poi.id} className="bg-white/5 p-4 rounded-3xl border border-white/5 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-300">{poi.name}</h4>
                <p className="text-[9px] text-slate-600 uppercase font-black">{poi.type.replace('_', ' ')}</p>
              </div>
              <span className="text-xs font-mono font-bold text-blue-500">{Math.round(poi.distance)}m</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}