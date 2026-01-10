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
  
  // Ref to track the timer so we can clear it if the user stops the loop
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- 1. Auth & GPS Init ---
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => setLastApiError(`GPS: ${err.message}`),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // --- 2. Landmark Discovery ---
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

  // --- 3. The Core Narration Engine ---
  const handleNarrate = async (isAutoCall = false) => {
    // Only block if a manual call is happening; let auto-calls replace content
    if (isNarrating && !isAutoCall) return;
    
    setIsNarrating(true);
    setLastApiError('');
    if (!isAutoCall) setCurrentNarration('Consulting the archives...');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pois, 
          locationContext, 
          model: selectedModel,
          customKey: userApiKey 
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || "API Failure");

      // --- PARSING STORY vs LINK ---
      // Expected format from API: STORY: [Text] LINK: [URL]
      const textResponse = data.text || "";
      const parts = textResponse.split(/LINK:/i);
      const storyText = parts[0].replace(/STORY:/i, '').trim();
      const linkText = parts[1]?.trim() || '';

      setCurrentNarration(storyText);
      setExternalLink(linkText);
      
      // Speak the Story
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(storyText);
      window.speechSynthesis.speak(utterance);

      // --- 30 SECOND LOOP LOGIC ---
      if (autoLoopActive || !isAutoCall) {
        if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
        loopTimerRef.current = setTimeout(() => {
          if (autoLoopActive) handleNarrate(true);
        }, 30000); 
      }

    } catch (e: any) {
      setLastApiError(e.message);
      setCurrentNarration("The archive is momentarily silent.");
    } finally {
      setIsNarrating(false);
    }
  };

  // Toggle for the Auto-Tour
  const toggleAutoTour = () => {
    const newState = !autoLoopActive;
    setAutoLoopActive(newState);
    if (newState) {
      handleNarrate(true);
    } else if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      window.speechSynthesis.cancel();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans max-w-lg mx-auto">
      <header className="mb-4">
        <h1 className="font-black text-blue-500 text-2xl italic tracking-tighter">3D VOLT TOUR</h1>
        <div className="bg-slate-900 p-3 rounded-xl mt-2 flex justify-between text-[10px] font-mono border border-white/10">
          <span className={location ? "text-green-400" : "text-red-500"}>GPS: {location ? 'FIXED' : 'OFF'}</span>
          <span className="text-blue-400">POIS: {pois.length} FOUND</span>
          <span className={autoLoopActive ? "text-blue-500 animate-pulse" : "text-slate-500"}>
            {autoLoopActive ? 'AUTO-TOUR ON' : 'MANUAL MODE'}
          </span>
        </div>
      </header>

      <main className="space-y-4">
        {/* Story Box */}
        
        <div className={`p-6 rounded-[2.5rem] border-2 min-h-[180px] flex flex-col justify-center transition-all duration-700 ${autoLoopActive ? 'border-blue-500 bg-blue-500/5' : 'border-white/5 bg-slate-950'}`}>
          <p className="text-slate-200 text-lg font-medium italic leading-relaxed text-center">
            {currentNarration || "Ready to explore the history of this street?"}
          </p>
          
          {externalLink && (
            <a 
              href={externalLink} 
              target="_blank" 
              className="mt-6 mx-auto bg-blue-600/20 text-blue-400 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-400/30 active:scale-95 transition-transform"
            >
              Verify Evidence ↗
            </a>
          )}

          {lastApiError && <p className="mt-4 text-[9px] text-red-500 font-mono text-center uppercase tracking-tighter">Error: {lastApiError}</p>}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 gap-3">
          <button 
            onClick={() => handleNarrate(false)} 
            className="w-full py-6 bg-white text-black rounded-full font-black text-lg uppercase tracking-tighter active:scale-95 transition-transform"
          >
            Instant Fact
          </button>
          
          <button 
            onClick={toggleAutoTour} 
            className={`w-full py-6 rounded-full font-black text-lg uppercase tracking-tighter active:scale-95 transition-transform border-2 ${autoLoopActive ? 'bg-red-600 border-red-600' : 'bg-transparent border-blue-600 text-blue-500'}`}
          >
            {autoLoopActive ? 'Stop Auto-Tour' : 'Start Auto-Tour (30s)'}
          </button>
        </div>

        {/* Advanced Settings */}
        <section className="bg-slate-900 p-5 rounded-2xl border border-white/5 space-y-4">
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Model Selection</label>
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full bg-black border border-white/10 p-3 rounded-xl text-xs font-bold text-blue-400">
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
              <option value="gemini-3-flash">Gemini 3 Flash (Advanced)</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Scanning Radius ({radius}m)</label>
            <input type="range" min="500" max="5000" step="500" value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} className="w-full accent-blue-600 h-1.5 bg-black rounded-lg appearance-none" />
          </div>
        </section>
      </main>

      <footer className="mt-auto pt-6 text-center">
        <p className="text-[8px] text-slate-700 uppercase font-bold tracking-[0.3em]">
          {locationContext ? `${locationContext.street}, ${locationContext.city}` : 'Calibrating Coordinates...'}
        </p>
      </footer>
    </div>
  );
}