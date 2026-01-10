'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

interface POI {
  id: string;
  name: string;
  type: string;
  distance: number;
}

export default function TourGuidePage() {
  const { data: session } = useSession();
  
  // States
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [radius, setRadius] = useState(2000);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing GPS...');
  
  const lastFetchedLocation = useRef<{lat: number, lon: number} | null>(null);

  // --- 1. Voice Engine (iPhone Fix) ---
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

  // --- 2. Distance Guard (Prevents Flickering) ---
  const calculateDistance = (l1: any, l2: any) => {
    const R = 6371e3;
    const dLat = (l2.lat - l1.lat) * Math.PI / 180;
    const dLon = (l2.lon - l1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(l1.lat * Math.PI / 180) * Math.cos(l2.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // --- 3. GPS Watcher ---
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const newLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      // Only update if moved > 30 meters
      if (!lastFetchedLocation.current || calculateDistance(lastFetchedLocation.current, newLoc) > 30) {
        setLocation(newLoc);
        lastFetchedLocation.current = newLoc;
      }
    }, (err) => setDebugInfo("GPS Error: Enable location"), { enableHighAccuracy: true });
    
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- 4. Discovery Sync (Find context & POIs) ---
  useEffect(() => {
    if (!location) return;
    const discover = async () => {
      try {
        setDebugInfo('Syncing sector data...');
        const res = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
        });
        const data = await res.json();
        setPois(data.pois || []);
        setLocationContext(data.locationContext || null);
        setDebugInfo(data.locationContext ? `Near: ${data.locationContext.street}` : 'Scanning...');
      } catch (e) {
        setDebugInfo('Sync failed');
      }
    };
    discover();
  }, [location, radius]);

  // --- 5. The Brain Trigger ---
  const handleNarrate = async () => {
    if (isNarrating || !locationContext) return;
    
    // iPhone Voice Unlock (Must happen in click event)
    if (voiceEnabled) unlockVoice();

    setIsNarrating(true);
    setCurrentNarration('Consulting digital archives...');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pois, 
          locationContext, 
          userEmail: session?.user?.email 
        })
      });
      const data = await res.json();
      if (data.text) {
        setCurrentNarration(data.text);
        if (voiceEnabled) speakText(data.text);
      }
    } catch (e) {
      setCurrentNarration("Lost connection to archives.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-sans">
      {/* Top Header with Login */}
      <header className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900 sticky top-0 z-50">
        <div>
          <h1 className="font-black text-blue-500 tracking-tighter">3D VOLT TOUR</h1>
          <p className="text-[9px] text-slate-500 uppercase font-bold">{debugInfo}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setVoiceEnabled(!voiceEnabled);
              if (!voiceEnabled) unlockVoice();
            }}
            className={`p-2 rounded-full transition ${voiceEnabled ? 'bg-green-600' : 'bg-slate-800'}`}
          >
            {voiceEnabled ? '🔊' : '🔇'}
          </button>

          {session ? (
            <div className="flex items-center gap-3">
              <img src={session.user?.image || ''} className="w-8 h-8 rounded-full border border-blue-500" />
              <button onClick={() => signOut()} className="text-[10px] font-bold text-slate-500">EXIT</button>
            </div>
          ) : (
            <button onClick={() => signIn('google')} className="bg-blue-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase">
              LOGIN
            </button>
          )}
        </div>
      </header>

      {/* Range Slider - TOP */}
      <div className="p-4 bg-slate-900/50 border-b border-white/5">
        <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-2">
          <span>Search Radar</span>
          <span className="text-blue-400">{radius}m</span>
        </div>
        <input 
          type="range" min="100" max="5000" step="100"
          value={radius} 
          onChange={(e) => setRadius(parseInt(e.target.value))} 
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" 
        />
      </div>

      <main className="p-4 flex-1 space-y-4 max-w-lg mx-auto w-full">
        {/* Narrative Box */}
        <section className={`transition-all duration-500 bg-slate-900 p-6 rounded-3xl border ${isNarrating ? 'border-blue-500 bg-blue-500/5' : 'border-white/10'} min-h-[300px]`}>
           <h3 className="text-[10px] font-black text-slate-600 uppercase mb-4 tracking-widest">Archive Content</h3>
           <p className="text-xl font-medium leading-relaxed text-slate-200">
            {currentNarration || "Welcome. Please login and press Narrate to explore the local history of your current location."}
           </p>
        </section>

        <button 
          onClick={handleNarrate} 
          disabled={isNarrating || !locationContext} 
          className="w-full py-6 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-3xl font-black text-lg tracking-widest shadow-2xl active:scale-95 transition-all"
        >
          {isNarrating ? 'AI THINKING...' : 'NARRATE NOW'}
        </button>

        {/* POI List */}
        <section className="pt-4">
          <h3 className="text-[10px] font-black text-slate-600 uppercase mb-4 px-1">Markers in sector</h3>
          <div className="space-y-3">
            {pois.length > 0 ? (
              pois.slice(0, 3).map((poi) => (
                <div key={poi.id} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-slate-300">{poi.name}</h4>
                    <p className="text-[10px] text-slate-500 uppercase font-black">{poi.type}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-400">{Math.round(poi.distance)}m</span>
                </div>
              ))
            ) : (
              <p className="text-center text-xs text-slate-700 font-bold uppercase py-4 italic">Using street-level archives...</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}