'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';

interface POI {
  id: string;
  name: string;
  type: string;
}

export default function TourGuidePage() {
  // --- State Management ---
  const [user, setUser] = useState<any>(null);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [radius, setRadius] = useState(5000); // Default to max for better discovery
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-flash");
  const [userApiKey, setUserApiKey] = useState("");
  const [lastApiError, setLastApiError] = useState('');
  const [appVersion] = useState("v1.8.0-stable");

  // --- Voice Engine State ---
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");

  // --- 1. Authentication ---
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- 2. Voice Initialization (Safari Fix) ---
  useEffect(() => {
    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      if (allVoices.length > 0) {
        const enVoices = allVoices.filter(v => v.lang.startsWith('en'));
        setVoices(enVoices);
        if (!selectedVoiceURI && enVoices.length > 0) {
          setSelectedVoiceURI(enVoices[0].voiceURI);
        }
      }
    };
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();
  }, [selectedVoiceURI]);

  // --- 3. GPS Tracking ---
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => setLastApiError(`GPS: ${err.message}`),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- 4. Discover Landmarks (POIs) ---
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
    })
    .catch(() => setLastApiError("Discovery service failed."));
  }, [location, radius]);

  // --- 5. AI Narration Trigger ---
  const handleNarrate = async () => {
    if (isNarrating) return;
    setIsNarrating(true);
    setLastApiError('');
    setCurrentNarration('Querying the historian...');

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

      // Safety: Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server error: Did not return JSON. Check API route.");
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || "API Error");

      setCurrentNarration(data.text);
      
      // Speech Output
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.text);
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);

    } catch (e: any) {
      setLastApiError(e.message);
      setCurrentNarration("The archive is currently unreachable.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans max-w-lg mx-auto selection:bg-blue-500/30">
      
      <header className="mb-6">
        <h1 className="font-black text-blue-500 text-2xl italic tracking-tighter uppercase">3D Volt Tour</h1>
        <div className="bg-slate-900 border border-white/10 p-3 rounded-xl mt-2 flex justify-between text-[10px] font-mono">
          <span className={location ? 'text-green-400' : 'text-yellow-500'}>
            GPS: {location ? 'FIXED' : 'SEARCHING'}
          </span>
          <span className={pois.length > 0 ? 'text-blue-400' : 'text-slate-500'}>
            POIS: {pois.length} FOUND
          </span>
          <span className="text-slate-500">{appVersion}</span>
        </div>
      </header>

      {!isUnlocked ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <button 
            onClick={() => setIsUnlocked(true)}
            className="w-full py-8 bg-blue-600 rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all"
          >
            UNLOCK TOUR 🔓
          </button>
          <p className="mt-4 text-[10px] text-slate-500 uppercase tracking-widest font-bold">Tap to enable audio & GPS</p>
        </div>
      ) : (
        <main className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Settings Section */}
          <section className="bg-slate-900/50 p-4 rounded-3xl border border-white/10 space-y-4">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">AI Historian Brain</label>
              <select 
                value={selectedModel} 
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-black border border-white/10 p-3 rounded-xl text-sm font-bold appearance-none outline-none focus:border-blue-500"
              >
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast/Reliable)</option>
                <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Exp)</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep History)</option>
              </select>
            </div>

            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Personal API Key (Optional)</label>
              <input 
                type="password"
                placeholder="Paste AIza... to use your own tokens"
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                className="w-full bg-black border border-white/10 p-3 rounded-xl text-[10px] font-mono focus:border-blue-500 outline-none"
              />
            </div>
          </section>

          {/* Radar Slider */}
          <section className="bg-slate-900/50 p-4 rounded-3xl border border-white/10">
            <div className="flex justify-between text-[10px] uppercase font-black text-slate-500 mb-2 tracking-tighter">
              <span>Scanning Radius</span>
              <span className="text-blue-400 font-mono">{radius}m</span>
            </div>
            <input 
              type="range" min="500" max="5000" step="500" 
              value={radius} 
              onChange={(e) => setRadius(parseInt(e.target.value))} 
              className="w-full h-1.5 accent-blue-500 bg-slate-800 rounded-lg appearance-none cursor-pointer" 
            />
          </section>

          {/* Narration Output */}
          <section className={`p-6 rounded-[2.5rem] border-2 transition-all duration-700 min-h-[160px] flex flex-col justify-center ${isNarrating ? 'border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/10' : 'border-white/5 bg-slate-950'}`}>
             <h3 className="text-[10px] font-black text-slate-600 uppercase mb-4 tracking-widest flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${isNarrating ? 'bg-blue-500 animate-ping' : 'bg-slate-700'}`}></div>
               Live Narration
             </h3>
             <p className="text-xl font-medium leading-relaxed text-slate-200">
              {currentNarration || (locationContext ? `Ready to explore ${locationContext.street}.` : "Detecting your location...")}
             </p>
             {lastApiError && (
               <div className="mt-4 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[9px] font-mono text-red-400 break-all">
                 ERROR: {lastApiError}
               </div>
             )}
          </section>

          <button 
            onClick={handleNarrate} 
            disabled={isNarrating || !location} 
            className="w-full py-7 bg-blue-600 rounded-[2.5rem] font-black text-lg tracking-widest shadow-2xl active:scale-95 transition-all disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isNarrating ? 'CONSULTING AI...' : 'NARRATE NOW'}
          </button>

          {/* Landmark List Preview */}
          {pois.length > 0 && (
            <div className="pt-4 space-y-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Nearby Landmarks</p>
              {pois.slice(0, 3).map(poi => (
                <div key={poi.id} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300">{poi.name}</span>
                  <span className="text-[9px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded-md font-black uppercase">{poi.type}</span>
                </div>
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  );
}