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
  // --- UI & App State ---
  const [user, setUser] = useState<any>(null);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('Hello 3DVOLT. Press Narrate to explore.');
  const [isNarrating, setIsNarrating] = useState(false);
  const [radius, setRadius] = useState(2000);
  const [appVersion] = useState("v1.7.0-PRO");

  // --- AI Settings State ---
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-flash");
  const [userApiKey, setUserApiKey] = useState("");

  // --- Debug / Diagnostic State ---
  const [apiStatus, setApiStatus] = useState<'idle' | 'calling' | 'success' | 'error'>('idle');
  const [lastApiError, setLastApiError] = useState('');

  // --- Voice & Audio State ---
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastFetchedLocation = useRef<{lat: number, lon: number} | null>(null);

  // --- 1. Auth & Initial Setup ---
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

  // --- 2. Voice Engine (Safari Fix) ---
  const updateVoices = () => {
    const allVoices = window.speechSynthesis.getVoices();
    if (allVoices.length > 0) {
      const enVoices = allVoices.filter(v => v.lang.startsWith('en'));
      setVoices(enVoices);
      if (!selectedVoiceURI && enVoices.length > 0) {
        const best = enVoices.find(v => v.name.includes('Samantha') || v.name.includes('Siri')) || enVoices[0];
        setSelectedVoiceURI(best.voiceURI);
      }
    }
  };

  useEffect(() => {
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();
    const timer = setInterval(() => { if (voices.length === 0) updateVoices(); }, 1000);
    return () => clearInterval(timer);
  }, [voices.length]);

  const handleStartTour = async () => {
    const primer = new SpeechSynthesisUtterance(" ");
    primer.volume = 0; 
    window.speechSynthesis.speak(primer);
    if (audioRef.current) {
      try { await audioRef.current.play(); } catch (e) {}
    }
    updateVoices();
    setIsUnlocked(true);
  };

  // --- 3. Location & Data Fetching ---
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const newLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      setLocation(newLoc);
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
    })
    .catch(err => setLastApiError("Discover failed: " + err.message));
  }, [location, radius]);

  // --- 4. Main Narration Logic ---
  const handleNarrate = async () => {
    if (isNarrating) return;
    
    setIsNarrating(true);
    setApiStatus('calling');
    setLastApiError('');
    setCurrentNarration('Consulting the archives...');

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

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server did not return JSON. Check API route.");
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.text || "API connection failed.");
      }

      setApiStatus('success');
      setCurrentNarration(data.text);
      
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.text);
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.rate = 0.9;
      }
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
    <div className="flex flex-col min-h-screen bg-black text-white font-sans selection:bg-blue-500/30">
      <audio ref={audioRef} loop src="https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3" />

      {/* Header */}
      <header className="p-4 bg-slate-900 border-b border-white/10 sticky top-0 z-50">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="font-black text-blue-500 text-xl tracking-tighter italic uppercase">3D VOLT TOUR</h1>
            <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">{appVersion}</p>
          </div>
          {user ? (
            <div className="flex items-center gap-2 bg-white/5 pr-3 rounded-full border border-white/10">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-black text-xs">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <button onClick={() => supabase.auth.signOut()} className="text-[9px] font-black text-slate-400 uppercase">Exit</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="bg-blue-600 px-5 py-2 rounded-full text-[10px] font-black uppercase">Login</button>
          )}
        </div>
        
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
          <div className="flex justify-between text-[10px] uppercase font-black text-slate-500 mb-2">
            <span>Radar Range</span>
            <span className="text-blue-400 font-mono">{radius}m</span>
          </div>
          <input type="range" min="100" max="5000" step="100" value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} className="w-full h-1.5 accent-blue-500 appearance-none bg-slate-800 rounded-lg cursor-pointer" />
        </div>
      </header>

      <main className="p-4 flex-1 space-y-4 max-w-lg mx-auto w-full">
        {!isUnlocked ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <button onClick={handleStartTour} disabled={!user} className="w-full py-8 bg-blue-600 rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all disabled:opacity-50">
              ACTIVATE TOUR 🔓
            </button>
            {!user && <p className="mt-4 text-[10px] text-slate-500 uppercase font-bold">Please Login First</p>}
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
            
            {/* Diagnostics Panel */}
            <section className="bg-slate-900/50 border border-white/10 rounded-3xl p-4 font-mono text-[10px]">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-blue-500 font-black uppercase tracking-widest">Diagnostics</h3>
                <span className={apiStatus === 'error' ? 'text-red-500' : 'text-green-500'}>{apiStatus.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-slate-400">
                <p>GPS: <span className="text-white">{location ? 'FIXED' : 'SEARCHING'}</span></p>
                <p>POIS: <span className="text-white">{pois.length} FOUND</span></p>
                <p>CTX: <span className="text-white">{locationContext ? 'OK' : 'WAIT'}</span></p>
                <p>KEY: <span className="text-white">{userApiKey ? 'PERSONAL' : 'SERVER'}</span></p>
              </div>
              {lastApiError && (
                <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg break-words">
                  ERROR: {lastApiError}
                </div>
              )}
            </section>

            {/* Model & Key Selection */}
            <section className="bg-slate-900 border border-white/10 rounded-3xl p-4 space-y-3">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Historian Model</label>
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full bg-black text-white p-3 rounded-xl border border-white/10 text-xs font-bold appearance-none">
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Recommended)</option>
                  <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (High Intelligence)</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Personal API Key (Overrides Server)</label>
                <input type="password" placeholder="Paste AIza... key to use your own tokens" value={userApiKey} onChange={(e) => setUserApiKey(e.target.value)} className="w-full bg-black text-white p-3 rounded-xl border border-white/10 text-xs font-mono" />
              </div>
            </section>

            {/* Narration Box */}
            <section className={`p-6 rounded-[2.5rem] border-2 transition-all duration-700 ${isNarrating ? 'border-blue-500 bg-blue-500/5' : 'border-white/5 bg-slate-950'}`}>
               <h3 className="text-[10px] font-black text-slate-600 uppercase mb-3 tracking-widest flex items-center gap-2">
                 <div className={`w-1.5 h-1.5 rounded-full ${isNarrating ? 'bg-blue-500 animate-ping' : 'bg-slate-700'}`}></div>
                 Narration
               </h3>
               <p className="text-xl font-medium leading-relaxed text-slate-200 min-h-[80px]">
                {currentNarration}
               </p>
            </section>

            <button onClick={handleNarrate} disabled={isNarrating} className="w-full py-7 bg-blue-600 rounded-[2.5rem] font-black text-lg tracking-widest shadow-2xl active:scale-95 transition-all disabled:bg-slate-800 shadow-blue-600/20">
              {isNarrating ? 'SYNCING...' : 'NARRATE NOW'}
            </button>

            {/* Landmark List */}
            <div className="pt-4 space-y-2">
               {pois.slice(0, 3).map(poi => (
                 <div key={poi.id} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                   <p className="font-bold text-sm">{poi.name}</p>
                   <span className="text-[10px] font-mono text-blue-500">{Math.round(poi.distance)}m</span>
                 </div>
               ))}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}