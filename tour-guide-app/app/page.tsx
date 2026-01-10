'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';

export default function TourGuidePage() {
  const [user, setUser] = useState<any>(null);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState<any[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [autoLoopActive, setAutoLoopActive] = useState(false);
  const [radius, setRadius] = useState(3000);
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [userApiKey, setUserApiKey] = useState("");
  const [lastApiError, setLastApiError] = useState('');

  // --- Voice & Timer States ---
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  
  // Using refs to ensure the timer always has the latest state
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- 1. Voice Initialization (Fix for Mobile) ---
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        const englishVoices = v.filter(voice => voice.lang.startsWith('en'));
        setVoices(englishVoices);
        if (englishVoices.length > 0 && !selectedVoiceURI) {
          setSelectedVoiceURI(englishVoices[0].voiceURI);
        }
      }
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, [selectedVoiceURI]);

  // --- 2. GPS & Auth ---
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => setLastApiError(`GPS: ${err.message}`),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // --- 3. Discovery ---
  useEffect(() => {
    if (!location) return;
    fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
    })
    .then(res => res.json())
    .then(data => {
      setPois(data.pois || []);
      setLocationContext(data.locationContext || null);
    });
  }, [location, radius]);

  // --- 4. The Countdown Logic (Fix for Stuck Timer) ---
  const startTimer = () => {
    // Clear any existing intervals
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);

    setTimeLeft(30);

    countdownIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Trigger next narration when we hit 0
          if (autoLoopActive) handleNarrate(true);
          return 30; // Reset
        }
        return prev - 1;
      });
    }, 1000);
  };

  // --- 5. Narration Engine (Fix for Audio) ---
  const handleNarrate = async (isAutoCall = false) => {
    if (isNarrating && !isAutoCall) return;
    setIsNarrating(true);
    setLastApiError('');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pois, locationContext, model: selectedModel, customKey: userApiKey })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || "API Failure");

      const parts = data.text.split(/LINK:/i);
      const storyText = parts[0].replace(/STORY:/i, '').trim();
      const linkText = parts[1]?.trim() || '';

      setCurrentNarration(storyText);
      setExternalLink(linkText);
      
      // VOICE FIX: Re-initialize Speech on every call
      if (!isMuted) {
        window.speechSynthesis.cancel(); // Stop current speech
        const utterance = new SpeechSynthesisUtterance(storyText);
        
        // Find the selected voice
        const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
        if (voice) utterance.voice = voice;
        
        // Essential for mobile browsers to allow "pocket" narration
        utterance.onend = () => console.log("Speech finished");
        window.speechSynthesis.speak(utterance);
      }

    } catch (e: any) {
      setLastApiError(e.message);
    } finally {
      setIsNarrating(false);
    }
  };

  const toggleAutoTour = () => {
    const newState = !autoLoopActive;
    setAutoLoopActive(newState);
    
    if (newState) {
      handleNarrate(true);
      startTimer();
    } else {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      window.speechSynthesis.cancel();
      setTimeLeft(30);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans max-w-lg mx-auto">
      <header className="mb-4">
        <div className="flex justify-between items-center">
          <h1 className="font-black text-blue-500 text-2xl italic tracking-tighter">3D VOLT TOUR</h1>
          <button 
            onClick={() => setIsMuted(!isMuted)} 
            className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest transition-colors ${isMuted ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-green-500 text-green-500 bg-green-500/10'}`}
          >
            {isMuted ? '🔇 Muted' : '🔊 Sound On'}
          </button>
        </div>
      </header>

      <main className="space-y-4">
        {/* Story Box & Timer */}
        <div className={`p-6 rounded-[2.5rem] border-2 min-h-[220px] relative flex flex-col justify-center transition-all duration-700 ${autoLoopActive ? 'border-blue-500 bg-blue-500/5' : 'border-white/5 bg-slate-950'}`}>
          {autoLoopActive && (
            <div className="absolute top-6 right-8 flex flex-col items-end">
              <span className="text-[8px] font-black text-blue-500 uppercase tracking-[0.2em] mb-1">Next Fact</span>
              <span className="text-2xl font-mono font-black text-white tabular-nums">{timeLeft}s</span>
            </div>
          )}
          
          <p className="text-slate-200 text-lg font-medium italic leading-relaxed text-center px-2">
            {currentNarration || "Calibrating archives for your location..."}
          </p>
          
          {externalLink && (
            <a href={externalLink} target="_blank" className="mt-8 mx-auto bg-blue-600/20 text-blue-400 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-400/30">
              Verify History ↗
            </a>
          )}
        </div>

        {/* Narrator Voice Selector */}
        <section className="bg-slate-900 p-4 rounded-2xl border border-white/5">
          <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Selected Narrator</label>
          <select 
            value={selectedVoiceURI} 
            onChange={(e) => setSelectedVoiceURI(e.target.value)}
            className="w-full bg-black border border-white/10 p-3 rounded-xl text-xs font-bold text-slate-300 outline-none focus:border-blue-500"
          >
            {voices.length > 0 ? voices.map(voice => (
              <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>
            )) : <option>Loading system voices...</option>}
          </select>
        </section>

        <button onClick={toggleAutoTour} className={`w-full py-7 rounded-full font-black text-xl uppercase tracking-tighter transition-all shadow-xl active:scale-95 ${autoLoopActive ? 'bg-red-600 shadow-red-900/20' : 'bg-blue-600 shadow-blue-900/20'}`}>
          {autoLoopActive ? 'Stop Auto-Tour' : 'Start Auto-Tour'}
        </button>

        {lastApiError && (
          <p className="text-[9px] text-red-500 font-mono text-center uppercase py-2 bg-red-500/5 rounded-lg border border-red-500/20">
            {lastApiError}
          </p>
        )}
      </main>
    </div>
  );
}