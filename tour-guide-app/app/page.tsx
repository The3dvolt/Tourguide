'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase'; // Using Supabase instead of NextAuth

export default function TourGuidePage() {
  const [user, setUser] = useState<any>(null);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [radius, setRadius] = useState(2000);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Syncing GPS...');
  
  const lastFetchedLocation = useRef<{lat: number, lon: number} | null>(null);

  // --- 1. Supabase Auth Logic ---
  useEffect(() => {
    // Check current user
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    // Listen for login/logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = () => supabase.auth.signInWithOAuth({ 
    provider: 'google',
    options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : '' }
  });
  
  const handleLogout = () => supabase.auth.signOut();

  // --- 2. Voice & GPS Logic ---
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

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition((pos) => {
      const newLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      setLocation(newLoc);
    }, null, { enableHighAccuracy: true });
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
    });
  }, [location, radius]);

  // --- 3. The Brain Trigger ---
  const handleNarrate = async () => {
    if (isNarrating || !locationContext) return;
    if (voiceEnabled) unlockVoice();

    setIsNarrating(true);
    setCurrentNarration('Consulting digital archives...');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        body: JSON.stringify({ 
          pois, 
          locationContext, 
          userEmail: user?.email 
        })
      });
      const data = await res.json();
      setCurrentNarration(data.text);
      if (voiceEnabled) speakText(data.text);
    } catch (e) {
      setCurrentNarration("Lost connection to archives.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-sans">
      <header className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900 sticky top-0 z-50">
        <div>
          <h1 className="font-black text-blue-500 tracking-tighter">3D VOLT TOUR</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setVoiceEnabled(!voiceEnabled); if (!voiceEnabled) unlockVoice(); }}
            className={`p-2 rounded-full transition ${voiceEnabled ? 'bg-green-600' : 'bg-slate-800'}`}
          >
            {voiceEnabled ? '🔊' : '🔇'}
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <img src={user.user_metadata.avatar_url} className="w-8 h-8 rounded-full border border-blue-500" />
              <button onClick={handleLogout} className="text-[10px] font-bold text-slate-500">EXIT</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="bg-blue-600 px-4 py-2 rounded-full text-[10px] font-black uppercase">
              LOGIN
            </button>
          )}
        </div>
      </header>

      <div className="p-4 bg-slate-900/50 border-b border-white/5">
        <input 
          type="range" min="100" max="5000" step="100"
          value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} 
          className="w-full h-1.5 accent-blue-500" 
        />
      </div>

      <main className="p-4 flex-1 space-y-4 max-w-lg mx-auto w-full">
        <section className="bg-slate-900 p-6 rounded-3xl border border-white/10 min-h-[300px]">
           <p className="text-xl font-medium leading-relaxed text-slate-200">
            {currentNarration || "Welcome. Please login and press Narrate."}
           </p>
        </section>

        <button 
          onClick={handleNarrate} 
          disabled={isNarrating || !locationContext} 
          className="w-full py-6 bg-blue-600 rounded-3xl font-black text-lg tracking-widest"
        >
          {isNarrating ? 'AI THINKING...' : 'NARRATE NOW'}
        </button>
      </main>
    </div>
  );
}