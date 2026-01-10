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
  
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- 1. Voice Initialization ---
  useEffect(() => {
    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      const englishVoices = v.filter(voice => voice.lang.startsWith('en'));
      setVoices(englishVoices);
      if (englishVoices.length > 0 && !selectedVoiceURI) {
        setSelectedVoiceURI(englishVoices[0].voiceURI);
      }
    };
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();
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

  // --- 4. Narration Engine ---
  const handleNarrate = async (isAutoCall = false) => {
    if (isNarrating && !isAutoCall) return;
    setIsNarrating(true);
    setLastApiError('');
    setTimeLeft(30); // Reset countdown on start

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
      
      // Voice Output Logic
      if (!isMuted) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(storyText);
        const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
        if (voice) utterance.voice = voice;
        window.speechSynthesis.speak(utterance);
      }

      // Manage Loops
      if (autoLoopActive || !isAutoCall) {
        startCountdown();
      }

    } catch (e: any) {
      setLastApiError(e.message);
    } finally {
      setIsNarrating(false);
    }
  };

  const startCountdown = () => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setTimeLeft(30);
    
    countdownIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    loopTimerRef.current = setTimeout(() => {
      if (autoLoopActive) handleNarrate(true);
    }, 30000);
  };

  const toggleAutoTour = () => {
    const newState = !autoLoopActive;
    setAutoLoopActive(newState);
    if (newState) {
      handleNarrate(true);
    } else {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      window.speechSynthesis.cancel();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans max-w-lg mx-auto">
      <header className="mb-4">
        <div className="flex justify-between items-center">
          <h1 className="font-black text-blue-500 text-2xl italic tracking-tighter">3D VOLT TOUR</h1>
          <button 
            onClick={() => setIsMuted(!isMuted)} 
            className={`p-2 rounded-full border ${isMuted ? 'border-red-500 text-red-500' : 'border-blue-500 text-blue-500'}`}
          >
            {isMuted ? '🔇 Muted' : '🔊 Sound On'}
          </button>
        </div>
      </header>

      <main className="space-y-4">
        {/* Story Box & Timer */}
        <div className={`p-6 rounded-[2.5rem] border-2 min-h-[220px] relative transition-all duration-700 ${autoLoopActive ? 'border-blue-500 bg-blue-500/5' : 'border-white/5 bg-slate-950'}`}>
          {autoLoopActive && (
            <div className="absolute top-4 right-6 flex items-center gap-2">
              <span className="text-[10px] font-black text-blue-500 uppercase">Next Sync:</span>
              <span className="text-xl font-mono font-black text-white">{timeLeft}s</span>
            </div>
          )}
          
          <p className="text-slate-200 text-lg font-medium italic leading-relaxed text-center mt-6">
            {currentNarration || "System ready for exploration..."}
          </p>
          
          {externalLink && (
            <a href={externalLink} target="_blank" className="mt-6 mx-auto bg-blue-600/20 text-blue-400 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-400/30">
              Verify Evidence ↗
            </a>
          )}
        </div>

        {/* Narrator Voice Selector */}
        <section className="bg-slate-900 p-4 rounded-2xl border border-white/5">
          <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Narrator Voice</label>
          <select 
            value={selectedVoiceURI} 
            onChange={(e) => setSelectedVoiceURI(e.target.value)}
            className="w-full bg-black border border-white/10 p-2 rounded-xl text-xs font-bold text-slate-300"
          >
            {voices.map(voice => (
              <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>
            ))}
          </select>
        </section>

        <div className="grid grid-cols-1 gap-3">
          <button onClick={toggleAutoTour} className={`w-full py-6 rounded-full font-black text-lg uppercase tracking-tighter transition-all border-2 ${autoLoopActive ? 'bg-red-600 border-red-600' : 'bg-transparent border-blue-600 text-blue-500'}`}>
            {autoLoopActive ? 'Stop Auto-Tour' : 'Start Auto-Tour (30s)'}
          </button>
        </div>
      </main>
    </div>
  );
}