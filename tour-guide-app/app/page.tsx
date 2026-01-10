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

  // --- Auth Logic ---
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = () => {
    unlockVoice(); // Prime voice engine on click
    supabase.auth.signInWithOAuth({ 
      provider: 'google', 
      options: { redirectTo: window.location.origin } 
    });
  };

  // --- Voice & GPS Fixes ---
  const unlockVoice = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  };

  const speakText = (text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
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
    if (voiceEnabled) unlockVoice();

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
      if (voiceEnabled) speakText(data.text);
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
            <button onClick={() => { setVoiceEnabled(!voiceEnabled); if (!voiceEnabled) unlockVoice(); }} className={`p-2 rounded-full transition ${voiceEnabled ? 'bg-green-600' : 'bg-slate-800'}`}>
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