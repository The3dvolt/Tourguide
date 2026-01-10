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
  const [radius, setRadius] = useState(5000); 
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-flash");
  const [userApiKey, setUserApiKey] = useState("");
  const [lastApiError, setLastApiError] = useState('');
  const [appVersion] = useState("v1.8.5-stable");

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

  // --- 2. Voice Initialization ---
  useEffect(() => {
    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      if (allVoices.length > 0) {
        // Filter for English or keep all for international support
        const enVoices = allVoices.filter(v => v.lang.startsWith('en'));
        setVoices(enVoices.length > 0 ? enVoices : allVoices);
        
        // Auto-select first voice if none selected
        if (!selectedVoiceURI && allVoices.length > 0) {
          setSelectedVoiceURI(allVoices[0].voiceURI);
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
    setCurrentNarration('Consulting the local archives...');

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

      // Robust JSON Check
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server Error: Response was not JSON. Check API logs.");
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || "API Error");

      setCurrentNarration(data.text);
      
      // Speech Output
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.text);
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
      
      // Mobile Safari Fix: Needs user gesture (which we have from the button click)
      window.speechSynthesis.speak(utterance);

    } catch (e: any) {
      setLastApiError(e.message);
      setCurrentNarration("The archive is currently unreachable.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans max-w-lg mx-auto">
      
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
            onClick={() => {
                setIsUnlocked(true);
                // Trigger a silent utterance to "warm up" the speech engine on iOS
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
            }}
            className="w-full py-10 bg-blue-600 rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all"
          >
            ACTIVATE SYSTEM ⚡
          </button>
          <p className="mt-6 text-[10px] text-slate-500 uppercase tracking-widest font-black opacity-50">Enable Audio & Neural Link</p>
        </div>
      ) : (
        <main className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Settings Section */}
          <section className="bg-slate-900/50 p-4 rounded-3xl border border-white/10 space-y-4 shadow-inner">
            <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">AI Brain</label>
                  <select 
                    value={selectedModel} 
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-black border border-white/10 p-3 rounded-xl text-xs font-bold appearance-none outline-none focus:border-blue-500"
                  >
                    <option value="gemini-1.5-flash">1.5 Flash (Stable)</option>
                    <option value="gemini-2.0-flash-exp">2.0 Flash (Exp)</option>
                    <option value="gemini-1.5-pro">1.5 Pro (Deep)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Voice Tone</label>
                  <select 
                    value={selectedVoiceURI} 
                    onChange={(e) => setSelectedVoiceURI(e.target.value)}
                    className="w-full bg-black border border-white/10 p-3 rounded-xl text-xs font-bold appearance-none outline-none focus:border-blue-500"
                  >
                    {voices.map(voice => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name.replace('Google', '').split(' ')[0]}
                        </option>
                    ))}
                  </select>
                </div>
            </div>

            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Personal API Key</label>
              <input 
                type="password"
                placeholder="AIza... (Optional)"
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
          <section className={`p-6 rounded-[2.5rem] border-2 transition-all duration-700 min-h-[160px] flex flex-col justify-center ${isNarrating ? 'border-blue-500 bg-blue-500/5' : 'border-white/5 bg-slate-950 shadow-inner'}`}>
             <h3 className="text-[10px] font-black text-slate-600 uppercase mb-4 tracking-widest flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${isNarrating ? 'bg-blue-500 animate-ping' : 'bg-slate-700'}`}></div>
               Neural Uplink
             </h3>
             <p className="text-xl font-medium leading-relaxed text-slate-200">
              {currentNarration || (locationContext ? `Standing by on ${locationContext.street}.` : "Calibrating sensors...")}
             </p>
             {lastApiError && (
               <div className="mt-4 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[9px] font-mono text-red-400 break-all leading-tight">
                 SYSTEM_ERR: {lastApiError}
               </div>
             )}
          </section>

          <button 
            onClick={handleNarrate} 
            disabled={isNarrating || !location} 
            className="w-full py-8 bg-blue-600 rounded-[2.5rem] font-black text-lg tracking-widest shadow-2xl active:scale-95 transition-all disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isNarrating ? 'DECRYPTING...' : 'NARRATE NOW'}
          </button>

          {/* POI Feed */}
          {pois.length > 0 && (
            <div className="pt-2 space-y-2 opacity-80">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-4">Nearby Data-Points</p>
              <div className="grid grid-cols-1 gap-2">
                {pois.slice(0, 3).map(poi => (
                    <div key={poi.id} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center px-5">
                    <span className="text-xs font-bold text-slate-300">{poi.name}</span>
                    <span className="text-[8px] bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full font-black uppercase">{poi.type}</span>
                    </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}