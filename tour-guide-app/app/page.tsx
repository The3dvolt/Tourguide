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
  const [currentNarration, setCurrentNarration] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [radius, setRadius] = useState(2000);
  const [debugInfo, setDebugInfo] = useState('Syncing GPS...');
  const [appVersion] = useState("v1.4.0"); // Incremented to force iPhone refresh

  // --- Voice & Audio Unlocking State ---
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastFetchedLocation = useRef<{lat: number, lon: number} | null>(null);

  // --- 1. Automatic Cache Clearing ---
  useEffect(() => {
    const savedVersion = localStorage.getItem('app_version');
    if (savedVersion !== appVersion) {
      localStorage.setItem('app_version', appVersion);
      // Force a hard reload to clear Safari's aggressive cache
      window.location.reload();
    }
  }, [appVersion]);

  // --- 2. Auth Logic ---
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

  // --- 3. Safari Voice Fixes ---
  const updateVoices = () => {
    const allVoices = window.speechSynthesis.getVoices();
    if (allVoices.length > 0) {
      // Filter for English and sort to put 'Natural' sounding voices first
      const enVoices = allVoices.filter(v => v.lang.startsWith('en'));
      setVoices(enVoices);
      
      if (!selectedVoiceURI && enVoices.length > 0) {
        const best = enVoices.find(v => v.name.includes('Samantha') || v.name.includes('Siri')) || enVoices[0];
        setSelectedVoiceURI(best.voiceURI);
      }
    }
  };

  useEffect(() => {
    // Voices are loaded asynchronously
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();
    // Repeatedly check for voices (Safari fix)
    const timer = setInterval(() => {
      if (voices.length === 0) updateVoices();
    }, 1000);
    return () => clearInterval(timer);
  }, [voices.length]);

  const handleStartTour = async () => {
    // 1. Silent Speech Unlock
    const primer = new SpeechSynthesisUtterance(" "); 
    primer.volume = 0; 
    window.speechSynthesis.speak(primer);
    
    // 2. Audio Element Unlock (for background audio permissions)
    if (audioRef.current) {
      try {
        await audioRef.current.play();
      } catch (e) {
        console.log("Audio play blocked, but speech primer sent.");
      }
    }

    updateVoices();
    setIsUnlocked(true);
  };

  const previewVoice = () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Testing my guide voice.");
    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  // --- 4. GPS Tracking ---
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
      // Stability: Update only if moved more than 30 meters
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

  // --- 5. Gemini Narration ---
  const handleNarrate = async () => {
    if (isNarrating || !locationContext) return;
    setIsNarrating(true);
    setCurrentNarration('Querying Gemini Historian...');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pois, locationContext })
      });
      const data = await res.json();
      setCurrentNarration(data.text);
      
      // Speak through the unlocked speech engine
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.text);
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.pitch = 1.0;
        utterance.rate = 0.9; // Slightly slower for better clarity
      }
      window.speechSynthesis.speak(utterance);

    } catch (e) {
      setCurrentNarration("Unable to reach the historian. Check your connection.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-sans selection:bg-blue-500/30">
      {/* Hidden audio element to help keep Safari's audio context alive */}
      <audio ref={audioRef} loop src="https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3" />

      <header className="p-4 bg-slate-900 border-b border-white/10 sticky top-0 z-50">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="font-black text-blue-500 text-xl tracking-tighter italic uppercase">3D Volt Guide</h1>
            <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">{debugInfo} | {appVersion}</p>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2 bg-white/5 pr-3 rounded-full border border-white/10">
                <img src={user.user_metadata?.avatar_url} className="w-8 h-8 rounded-full border border-blue-500" />
                <button onClick={() => supabase.auth.signOut()} className="text-[9px] font-black text-slate-400 uppercase">Exit</button>
              </div>
            ) : (
              <button onClick={handleLogin} className="bg-blue-600 px-5 py-2 rounded-full text-[10px] font-black uppercase shadow-lg shadow-blue-600/20">Login</button>
            )}
          </div>
        </div>
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
          <div className="flex justify-between text-[10px] uppercase font-black text-slate-500 mb-2 tracking-tighter">
            <span>Scanning Radius</span>
            <span className="text-blue-400 font-mono">{radius}m</span>
          </div>
          <input type="range" min="100" max="5000" step="100" value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} className="w-full h-1.5 accent-blue-500 bg-slate-800 rounded-lg appearance-none cursor-pointer" />
        </div>
      </header>

      <main className="p-4 flex-1 space-y-4 max-w-lg mx-auto w-full">
        {!isUnlocked ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
            <div className="mb-8">
              <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                <span className="text-4xl">🔊</span>
              </div>
              <h2 className="text-2xl font-bold mb-2">Ready to Explore?</h2>
              <p className="text-slate-500 text-sm leading-relaxed">Tap below to activate the historian's voice and begin your location-aware tour.</p>
            </div>
            
            <button 
              onClick={handleStartTour}
              disabled={!user}
              className="w-full py-7 bg-blue-600 rounded-[2.5rem] font-black text-lg tracking-widest shadow-2xl active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
            >
              ACTIVATE TOUR 🔓
            </button>
            {!user && <p className="mt-4 text-[10px] text-red-500 uppercase font-black tracking-widest animate-pulse">Authentication Required</p>}
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Guide Settings */}
            <section className="p-4 rounded-3xl bg-slate-900 border border-white/10 mb-4">
              <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Selected Historian</label>
              <div className="flex gap-2">
                <select 
                  value={selectedVoiceURI} 
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="flex-1 bg-black text-white p-3 rounded-xl border border-white/10 text-xs font-bold appearance-none outline-none focus:border-blue-500"
                >
                  {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                </select>
                <button onClick={previewVoice} className="bg-white/5 px-4 rounded-xl border border-white/10 text-lg hover:bg-white/10 transition-colors">🔊</button>
              </div>
            </section>

            {/* Narration Display */}
            <section className={`p-6 rounded-[2.5rem] border-2 transition-all duration-1000 ${isNarrating ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.2)]' : 'border-white/5 bg-slate-950'}`}>
               <h3 className="text-[10px] font-black text-slate-600 uppercase mb-4 tracking-widest flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${isNarrating ? 'bg-blue-500 animate-ping' : 'bg-slate-700'}`}></div>
                 Historical Narration
               </h3>
               <p className="text-xl font-medium leading-relaxed text-slate-100 min-h-[100px]">
                {currentNarration || "Walk towards a landmark or press Narrate to learn about this location."}
               </p>
            </section>

            <button 
              onClick={handleNarrate} 
              disabled={isNarrating || !locationContext} 
              className="w-full mt-6 py-7 bg-blue-600 rounded-[2.5rem] font-black text-lg tracking-widest shadow-2xl active:scale-95 transition-all disabled:bg-slate-800 disabled:text-slate-500 shadow-blue-600/20"
            >
              {isNarrating ? 'TRANSCRIBING...' : 'NARRATE NOW'}
            </button>

            {/* Landmarks List */}
            <div className="mt-8 space-y-3 pb-10">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Nearby Landmarks</h4>
              {pois.length > 0 ? pois.slice(0, 3).map((poi) => (
                <div key={poi.id} className="bg-white/5 p-4 rounded-3xl border border-white/5 flex justify-between items-center hover:bg-white/10 transition-colors">
                  <div>
                    <h4 className="font-bold text-slate-200 text-sm">{poi.name}</h4>
                    <p className="text-[9px] text-slate-500 uppercase font-black">{poi.type.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-blue-500 block">{Math.round(poi.distance)}m</span>
                  </div>
                </div>
              )) : (
                <div className="text-center p-8 border-2 border-dashed border-white/5 rounded-3xl">
                  <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">No landmarks in range</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}