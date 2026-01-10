'use client';

import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';

export default function TourGuidePage() {
  // --- State Management ---
  const [user, setUser] = useState<any>(null);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState<any[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [radius, setRadius] = useState(3000);
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [userApiKey, setUserApiKey] = useState("");
  const [lastApiError, setLastApiError] = useState('');
  const [appVersion] = useState("v1.9.0-2026-STABLE");

  // --- 1. Authentication ---
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  // --- 2. Live GPS Tracking ---
  useEffect(() => {
    if (!navigator.geolocation) {
      setLastApiError("Geolocation not supported by browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => setLastApiError(`GPS Error: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- 3. Discovery Logic (POI Search) ---
  useEffect(() => {
    if (!location) return;

    const fetchPOIs = async () => {
      try {
        const res = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
        });
        
        if (!res.ok) throw new Error("Discovery service offline");
        
        const data = await res.json();
        setPois(data.pois || []);
        setLocationContext(data.locationContext || { street: "this area", city: "Local" });
      } catch (err: any) {
        console.error("Discovery error:", err);
      }
    };

    fetchPOIs();
  }, [location, radius]);

  // --- 4. Narration Logic ---
  const handleNarrate = async () => {
    if (isNarrating) return;
    setIsNarrating(true);
    setLastApiError('');
    setCurrentNarration('Accessing historical archives...');

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

      // Guard against non-JSON responses (prevents "Pattern match" error)
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await res.text();
        throw new Error(`Server returned non-JSON: ${textError.slice(0, 50)}`);
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || `Error ${res.status}`);

      setCurrentNarration(data.text);
      
      // Text-to-Speech
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.text);
      utterance.rate = 0.9; // Slightly slower for "Historian" vibe
      window.speechSynthesis.speak(utterance);

    } catch (e: any) {
      setLastApiError(e.message);
      setCurrentNarration("The archive is momentarily silent.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans max-w-lg mx-auto">
      {/* Header / Diagnostics */}
      <header className="mb-4">
        <div className="flex justify-between items-center">
          <h1 className="font-black text-blue-500 text-xl italic tracking-tighter">3D VOLT TOUR</h1>
          <span className="text-[9px] text-slate-600 font-mono">{appVersion}</span>
        </div>
        
        <div className="bg-slate-900 border border-white/10 p-3 rounded-xl mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono text-center">
          <div className={location ? "text-green-400" : "text-amber-500 animate-pulse"}>
            GPS: {location ? 'FIXED' : 'SEARCHING'}
          </div>
          <div className={pois.length > 0 ? "text-blue-400" : "text-slate-500"}>
            POIS: {pois.length} FOUND
          </div>
          <div className="text-slate-400">
            KEY: {userApiKey ? 'USER' : 'SERVER'}
          </div>
        </div>
      </header>

      <main className="space-y-4">
        {/* Settings Panel */}
        <section className="bg-slate-900 p-4 rounded-2xl border border-white/5 space-y-4">
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">AI Historian Engine</label>
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)} 
              className="w-full bg-black border border-white/10 p-3 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast/2026 Stable)</option>
              <option value="gemini-3-flash">Gemini 3 Flash (Advanced Reasoning)</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro (Max Depth)</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Custom API Key (Optional)</label>
            <input 
              type="password" 
              placeholder="Paste AIza... key to use personal tokens" 
              className="w-full bg-black border border-white/10 p-3 rounded-xl text-[10px] font-mono outline-none focus:border-blue-500"
              value={userApiKey}
              onChange={(e) => setUserApiKey(e.target.value)}
            />
          </div>
        </section>

        {/* Narrative Display */}
        <div className={`p-6 rounded-[2.5rem] border-2 min-h-[160px] flex flex-col justify-center transition-all duration-500 ${isNarrating ? 'border-blue-500 bg-blue-500/5' : 'border-white/5 bg-slate-950'}`}>
           <p className="text-slate-200 text-lg font-medium italic leading-relaxed text-center">
             {currentNarration || "Stand near a landmark and press Narrate."}
           </p>
           {lastApiError && (
             <div className="mt-4 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-[9px] text-red-400 font-mono break-all text-center uppercase tracking-widest">
                  System Error: {lastApiError}
                </p>
             </div>
           )}
        </div>

        {/* Main Action */}
        <button 
          onClick={handleNarrate} 
          disabled={isNarrating || !location} 
          className="w-full py-7 bg-blue-600 rounded-full font-black text-xl shadow-2xl shadow-blue-900/40 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all uppercase tracking-tighter"
        >
          {isNarrating ? 'Synchronizing...' : 'Narrate History'}
        </button>

        {/* Radar Range Control */}
        <div className="bg-slate-900 p-5 rounded-2xl border border-white/5">
          <div className="flex justify-between text-[10px] uppercase font-black text-slate-500 mb-3">
            <span>Radar Range</span>
            <span className="text-blue-400 tracking-widest">{radius} Meters</span>
          </div>
          <input 
            type="range" 
            min="500" 
            max="5000" 
            step="500" 
            value={radius} 
            onChange={(e) => setRadius(parseInt(e.target.value))} 
            className="w-full h-1.5 bg-black rounded-lg appearance-none cursor-pointer accent-blue-500" 
          />
        </div>
      </main>

      {/* Footer Nav / Status */}
      <footer className="mt-auto pt-6 text-center">
        <p className="text-[8px] text-slate-700 uppercase font-bold tracking-[0.2em]">
          {locationContext ? `${locationContext.street}, ${locationContext.city}` : 'Awaiting Coordinate Lock'}
        </p>
      </footer>
    </div>
  );
}