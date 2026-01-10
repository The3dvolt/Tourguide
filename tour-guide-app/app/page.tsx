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
  // --- Core State ---
  const [user, setUser] = useState<any>(null);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  
  // --- AI & Narration State ---
  const [currentNarration, setCurrentNarration] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-flash");
  const [userApiKey, setUserApiKey] = useState(""); 
  
  // --- Debug & UI State ---
  const [radius, setRadius] = useState(2000);
  const [apiStatus, setApiStatus] = useState<'idle' | 'calling' | 'success' | 'error'>('idle');
  const [lastApiError, setLastApiError] = useState('');
  const [appVersion] = useState("v1.6.0-pro");
  const [isUnlocked, setIsUnlocked] = useState(false);

  // --- Voice Engine State ---
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastFetchedLocation = useRef<{lat: number, lon: number} | null>(null);

  // 1. Sync User Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // 2. Safari Voice Polling
  useEffect(() => {
    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        const en = v.filter(v => v.lang.startsWith('en'));
        setVoices(en);
        if (!selectedVoiceURI && en.length > 0) {
          const best = en.find(v => v.name.includes('Siri') || v.name.includes('Samantha')) || en[0];
          setSelectedVoiceURI(best.voiceURI);
        }
      }
    };
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();
    const t = setInterval(updateVoices, 1000);
    return () => clearInterval(t);
  }, [selectedVoiceURI]);

  // 3. GPS Tracker
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const newLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      setLocation(newLoc);
    }, (err) => setLastApiError(`GPS: ${err.message}`), { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 4. Landmark Discovery
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
    });
  }, [location, radius]);

  // 5. Trigger Narration
  const handleNarrate = async () => {
    if (isNarrating) return;
    setIsNarrating(true);
    setApiStatus('calling');
    setLastApiError('');
    setCurrentNarration('Connecting to History Archive...');

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

      if (!res.ok) {
        throw new Error(data.details || data.text || "Connection Error");
      }

      setApiStatus('success');
      setCurrentNarration(data.text);
      
      // Speech Output
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.text);
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);

    } catch (e: any) {
      setApiStatus('error');
      setLastApiError(e.message);
      setCurrentNarration("The archive is currently unreachable.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-sans p-4 max-w-lg mx-auto">
      <header className="flex justify-between items-center py-4 border-b border-white/10 mb-6">
        <div>
          <h1 className="font-black text-blue-500 italic text-xl tracking-tighter">3D VOLT TOUR</h1>
          <p className="text-[9px] text-slate-500 font-mono uppercase">{appVersion}</p>
        </div>
        {user && <img src={user.user_metadata?.avatar_url} className="w-8 h-8 rounded-full border border-blue-500" />}
      </header>

      {!isUnlocked ? (
        <div className="flex-1 flex flex-col justify-center">
          <button onClick={() => setIsUnlocked(true)} className="w-full py-8 bg-blue-600 rounded-[2.5rem] font-black text-lg shadow-2xl">
            UNLOCK AI GUIDE 🔓
          </button>
        </div>
      ) : (
        <div className="space-y-4 pb-10">
          
          {/* SYSTEM DEBUG DRAWER */}
          <div className="bg-slate-900/50 border border-white/10 p-4 rounded-3xl font-mono text-[10px]">
            <div className="flex justify-between mb-2">
              <span className="text-blue-400 font-black">DIAGNOSTICS</span>
              <span className={apiStatus === 'error' ? 'text-red-500' : 'text-green-500'}>{apiStatus.toUpperCase()}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-slate-400">
              <p>GPS: <span className="text-white">{location ? 'FIXED' : 'SEARCHING'}</span></p>
              <p>POIS: <span className="text-white">{pois.length} FOUND</span></p>
              <p>CTX: <span className="text-white">{locationContext ? 'OK' : 'EMPTY'}</span></p>
              <p>KEY: <span className="text-white">{userApiKey ? 'USER' : 'SERVER'}</span></p>
            </div>
            {lastApiError && (
              <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 text-red-400 leading-tight">
                {lastApiError.includes('429') ? "QUOTA EXCEEDED: Try switching to 1.5 Flash model below." : `ERROR: ${lastApiError}`}
              </div>
            )}
          </div>

          {/* AI SETTINGS */}
          <section className="bg-slate-900 border border-white/10 p-4 rounded-3xl space-y-4">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase block mb-2">Historian Model</label>
              <select 
                value={selectedModel} 
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-black text-white p-3 rounded-xl border border-white/10 text-xs font-bold"
              >
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Recommended)</option>
                <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental)</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (High Detail)</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase block mb-2">Personal API Key (Overrides Server)</label>
              <input 
                type="password"
                placeholder="Paste AIza... key to use your own tokens"
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                className="w-full bg-black text-white p-3 rounded-xl border border-white/10 text-[10px] font-mono"
              />
            </div>
          </section>

          {/* NARRATION BOX */}
          <section className={`p-6 rounded-[2.5rem] border-2 transition-all duration-700 ${isNarrating ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'border-white/5 bg-slate-950'}`}>
             <h3 className="text-[9px] font-black text-slate-600 uppercase mb-4 tracking-widest flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isNarrating ? 'bg-blue-500 animate-ping' : 'bg-slate-700'}`}></div>
                Narration
             </h3>
             <p className="text-lg font-medium leading-relaxed text-slate-200">
              {currentNarration || "System ready. Press Narrate to begin."}
             </p>
          </section>

          <button 
            onClick={handleNarrate} 
            disabled={isNarrating} 
            className="w-full py-7 bg-blue-600 rounded-[2.5rem] font-black text-lg tracking-widest shadow-2xl active:scale-95 transition-all disabled:opacity-50"
          >
            {isNarrating ? 'CONSULTING AI...' : 'NARRATE NOW'}
          </button>

          {/* POI LIST */}
          <div className="space-y-2">
            <p className="text-[9px] font-black text-slate-500 uppercase ml-2">Nearby Landmarks</p>
            {pois.slice(0, 3).map(poi => (
              <div key={poi.id} className="bg-white/5 p-4 rounded-3xl border border-white/5 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-300">{poi.name}</span>
                <span className="text-[10px] font-mono text-blue-500">{Math.round(poi.distance)}m</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}