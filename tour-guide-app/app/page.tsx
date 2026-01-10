'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// --- Initialize Supabase Client ---
// Note: In Next.js, these must start with NEXT_PUBLIC_ to work on the phone
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface POI {
  id: string;
  name: string;
  type: string;
  distance: number;
}

export default function TourGuidePage() {
  // Auth State
  const [user, setUser] = useState<any>(null);
  
  // App States
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [radius, setRadius] = useState(2000);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Waiting for GPS...');
  
  const lastFetchedLocation = useRef<{lat: number, lon: number} | null>(null);

  // --- 1. Supabase Auth Logic ---
  useEffect(() => {
    // Check for existing session
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    checkUser();

    // Listen for login/logout changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    // This opens a popup/redirect to Google. NO 404 possible here.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) console.error("Login Error:", error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- 2. iPhone Voice Unlock ---
  const unlockVoice = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance('');
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

  // --- 3. GPS & Flicker Protection ---
  const calculateDistance = (l1: any, l2: any) => {
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
      if (!lastFetchedLocation.current || calculateDistance(lastFetchedLocation.current, newLoc) > 30) {
        setLocation(newLoc);
        lastFetchedLocation.current = newLoc;
      }
    }, null, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- 4. Discovery API ---
  useEffect(() => {
    if (!location) return;
    const discover = async () => {
      try {
        const res = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
        });
        const data = await res.json();
        setPois(data.pois || []);
        setLocationContext(data.locationContext || null);
        if (data.locationContext) setDebugInfo(`Active: ${data.locationContext.street}`);
      } catch (e) {
        setDebugInfo('Search failed');
      }
    };
    discover();
  }, [location, radius]);

  // --- 5. Narrate Logic ---
  const handleNarrate = async () => {
    if (isNarrating || !locationContext) return;
    if (voiceEnabled) unlockVoice(); // Unlock iPhone audio

    setIsNarrating(true);
    setCurrentNarration('Consulting AI archives...');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pois, 
          locationContext, 
          userEmail: user?.email 
        })
      });
      const data = await res.json();
      if (data.text) {
        setCurrentNarration(data.text);
        if (voiceEnabled) speakText(data.text);
      }
    } catch (e) {
      setCurrentNarration("Lost connection to the brain.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-sans">
      {/* Header */}
      <header className="p-4 border-b border-white/10 bg-slate-900 sticky top-0 z-50">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="font-black text-blue-500 tracking-tighter text-xl italic">3D VOLT TOUR</h1>
            <p className="text-[9px] text-slate-500 uppercase font-bold">{debugInfo}</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { setVoiceEnabled(!voiceEnabled); if (!voiceEnabled) unlockVoice(); }}
              className={`p-2 rounded-full transition-all ${voiceEnabled ? 'bg-green-600 scale-110' : 'bg-slate-800 opacity-50'}`}
            >
              {voiceEnabled ? '🔊' : '🔇'}
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <img src={user.user_metadata?.avatar_url} className="w-8 h-8 rounded-full border-2 border-blue-500" />
                <button onClick={handleLogout} className="text-[10px] font-black text-slate-500 uppercase">Exit</button>
              </div>
            ) : (
              <button onClick={handleLogin} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-full text-[10px] font-black uppercase shadow-lg shadow-blue-600/20">
                Login with Google
              </button>
            )}
          </div>
        </div>

        {/* Radar Range - At the Top */}
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
          <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-2">
            <span>Scan Radar</span>
            <span className="text-blue-400 font-mono">{radius}m</span>
          </div>
          <input 
            type="range" min="100" max="5000" step="100"
            value={radius} 
            onChange={(e) => setRadius(parseInt(e.target.value))} 
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" 
          />
        </div>
      </header>

      <main className="p-4 flex-1 space-y-4 max-w-lg mx-auto w-full">
        {/* Narrative Box */}
        <section className={`transition-all duration-700 bg-slate-950 p-6 rounded-[2.5rem] border-2 ${isNarrating ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_30px_rgba(59,130,246,0.1)]' : 'border-white/5'}`}>
           <div className="flex items-center gap-2 mb-4">
             <div className={`w-2 h-2 rounded-full ${isNarrating ? 'bg-blue-500 animate-ping' : 'bg-slate-700'}`}></div>
             <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">History Archive</h3>
           </div>
           <p className="text-xl font-medium leading-relaxed text-slate-200">
            {currentNarration || (user ? `Hello ${user.user_metadata?.full_name?.split(' ')[0]}. Press Narrate to explore the secrets of ${locationContext?.city || 'this area'}.` : "Please Login to unlock the AI Tour Guide.")}
           </p>
        </section>

        {/* Action Button */}
        <button 
          onClick={handleNarrate} 
          disabled={isNarrating || !locationContext} 
          className="w-full py-7 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-900 disabled:text-slate-700 rounded-[2.5rem] font-black text-lg tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all"
        >
          {isNarrating ? 'SYNCHRONIZING...' : 'NARRATE NOW'}
        </button>

        {/* Markers List */}
        <section className="pt-2">
          <h3 className="text-[10px] font-black text-slate-700 uppercase mb-4 px-2 tracking-widest text-center">Nearby Signatures</h3>
          <div className="space-y-3">
            {pois.length > 0 ? (
              pois.slice(0, 3).map((poi) => (
                <div key={poi.id} className="bg-white/5 p-4 rounded-3xl border border-white/5 flex justify-between items-center group active:bg-white/10 transition-colors">
                  <div>
                    <h4 className="font-bold text-slate-300 group-active:text-blue-400 transition-colors">{poi.name}</h4>
                    <p className="text-[9px] text-slate-600 uppercase font-black tracking-tighter">{poi.type.replace('_', ' ')}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-500">{Math.round(poi.distance)}m</span>
                </div>
              ))
            ) : (
              <p className="text-center text-[10px] text-slate-700 font-bold uppercase py-6 border-2 border-dashed border-white/5 rounded-3xl">Scanning street archives...</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}