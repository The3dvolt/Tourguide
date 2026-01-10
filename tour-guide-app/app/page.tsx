I have analyzed your code. The reason for the constant flashing and the "Obscured" error is a looping re-fetch in your useEffect. Every time a POI is found, the state updates, which triggers the effect again, causing a never-ending cycle that eventually hits your API limit.

I have added a Ref-based cooldown and a hard-coded fallback inside the frontend to ensure that even if your backend or the external Overpass API fails, the app still has "Virtual Vectors" to narrate.

🛠️ The Fixed app/page.tsx
TypeScript

'use client';

import { useState, useEffect, useRef } from 'react';

// --- Math Helpers ---
function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin((lon2 - lon1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
  const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
            Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lon2 - lon1) * (Math.PI / 180));
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; 
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export default function TourGuidePage() {
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [address, setAddress] = useState("Locating street...");
  const [heading, setHeading] = useState(0); 
  const [pois, setPois] = useState<any[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [arrowRotation, setArrowRotation] = useState(0);
  const [currentNarration, setCurrentNarration] = useState('');
  const [autoLoopActive, setAutoLoopActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120); 
  const [isMuted, setIsMuted] = useState(false);
  const [radius] = useState(5000); 
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash"); 
  const [isMounted, setIsMounted] = useState(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDiscoveryRef = useRef<number>(0); // Prevents the flashing loop

  // --- 0. Hydration Guard ---
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // --- 1. Audio Setup ---
  useEffect(() => {
    if (!isMounted) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      const engVoices = v.filter(voice => voice.lang.startsWith('en'));
      setVoices(engVoices);
      if (engVoices.length > 0 && !selectedVoiceURI) {
        setSelectedVoiceURI(engVoices[0].voiceURI);
      }
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, [isMounted, selectedVoiceURI]);

  // --- 2. Sensors (GPS & Compass) ---
  useEffect(() => {
    if (!isMounted) return;

    const handleOrientation = (e: any) => {
      let compass = 0;
      if (e.webkitCompassHeading) {
        compass = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        compass = 360 - e.alpha;
      }
      setHeading(compass);
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);

    const watchId = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setLocation({ lat: latitude, lon: longitude });

      if (pois.length > 0) {
        const target = pois[0];
        const tLat = target.lat || target.center?.lat;
        const tLon = target.lon || target.center?.lon;
        
        if (tLat && tLon) {
          const d = getDistance(latitude, longitude, tLat, tLon);
          setDistance(d);
          const bearing = getBearing(latitude, longitude, tLat, tLon);
          setArrowRotation(bearing - heading);
        }
      }
    }, (err) => console.error(err), { enableHighAccuracy: true });

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('deviceorientation', handleOrientation);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isMounted, pois.length, heading]); // Removed full 'pois' to stop unnecessary triggers

  // --- 3. POI Discovery (With Loop Protection) ---
  useEffect(() => {
    if (!location) return;
    
    // Cooldown: Only fetch once every 20 seconds to stop the flashing
    const now = Date.now();
    if (now - lastDiscoveryRef.current < 20000) return; 
    lastDiscoveryRef.current = now;

    fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
    })
    .then(res => res.json())
    .then(data => {
      if (!data.pois || data.pois.length === 0) {
        // Essential Fallback POI
        setPois([{ 
            id: 'fallback', 
            name: 'the local history of this neighborhood', 
            lat: location.lat + 0.001, 
            lon: location.lon + 0.001 
        }]);
      } else {
        setPois(data.pois);
      }
      if (data.locationContext?.street) setAddress(data.locationContext.street);
    })
    .catch(() => {
        setAddress("Using offline vectors...");
        setPois([{ id: 'offline', name: 'local architecture', lat: location.lat + 0.001, lon: location.lon + 0.001 }]);
    });
  }, [location?.lat, location?.lon, radius]);

  // --- 4. Narration Logic ---
  const handleNarrate = async () => {
    if (pois.length === 0) {
        setCurrentNarration("Waiting for satellite lock...");
        return;
    }

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pois, 
          locationContext: { street: address }, 
          model: selectedModel 
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || "API Error");

      const cleanText = data.text.replace(/STORY:|LINK:|LINKEDIN:|VERIFY:/gi, '').trim();
      setCurrentNarration(cleanText);

      if (!isMuted && typeof window !== 'undefined') {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(cleanText);
        const v = voices.find(x => x.voiceURI === selectedVoiceURI);
        if (v) u.voice = v;
        window.speechSynthesis.speak(u);
      }
    } catch (e: any) { 
      setCurrentNarration(`Archive error: ${e.message || "Connection lost"}`);
    }
  };

  const toggleAutoTour = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try { await (DeviceOrientationEvent as any).requestPermission(); } catch (e) { console.warn(e); }
    }
    
    const start = !autoLoopActive;
    setAutoLoopActive(start);
    
    if (start) {
      handleNarrate();
      countdownIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { 
            handleNarrate(); 
            return 120; 
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (typeof window !== 'undefined') window.speechSynthesis.cancel();
      setTimeLeft(120);
    }
  };

  if (!isMounted) return <div className="min-h-screen bg-black" />;

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 max-w-lg mx-auto font-sans overflow-hidden">
      <header className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h1 className="font-black text-lime-500 text-xl italic tracking-tighter uppercase leading-none">3D VOLT TOUR</h1>
          <p className="text-white font-bold text-[10px] mt-1 uppercase tracking-widest bg-zinc-900 w-fit px-2 py-0.5 rounded">
            {address}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
            <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">POIS: {pois.length} FOUND</span>
            <button onClick={() => {
            setIsMuted(!isMuted);
            if (!isMuted) window.speechSynthesis.cancel();
            }} className={`px-4 py-2 rounded-full text-[9px] font-black border uppercase transition-all ${isMuted ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-lime-500 text-lime-500 bg-lime-500/10'}`}>
            {isMuted ? '🔇 Muted' : '🔊 Sound On'}
            </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center">
        <div className="relative w-full aspect-square flex flex-col items-center justify-center">
          <div style={{ perspective: '1200px' }} className="relative z-10">
            <div className="transition-transform duration-150 ease-linear" style={{ transform: `rotateX(60deg) rotateZ(${arrowRotation}deg)` }}>
              <div className="w-28 h-28 text-lime-400 drop-shadow-[0_0_20px_rgba(163,230,53,1)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" /><polyline points="18 9 12 3 6 9" />
                </svg>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-6xl font-mono font-black tabular-nums tracking-tighter">
              {distance !== null ? `${distance}m` : '--'}
            </p>
            <p className="text-[10px] font-black text-lime-500 uppercase tracking-[0.5em]">Target Proximity</p>
          </div>
        </div>

        <div className={`w-full mt-2 p-6 rounded-[2.5rem] border-2 transition-all duration-700 relative min-h-[140px] flex flex-col justify-center ${autoLoopActive ? 'border-lime-500 bg-lime-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
          <p className="text-zinc-100 text-lg font-medium italic text-center leading-snug">
            {currentNarration || "Calibrating historical vectors..."}
          </p>
        </div>

        <div className="w-full mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
             <div className="bg-zinc-900 p-2 rounded-xl border border-white/5">
                <label className="text-[8px] uppercase font-black text-lime-500 block mb-1 ml-1">AI Brain</label>
                <select 
                  value={selectedModel} 
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-transparent text-[10px] font-bold text-zinc-300 outline-none"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Stable)</option>
                  <option value="gemini-3-flash">Gemini 3 Flash (Fast)</option>
                </select>
             </div>

             <div className="bg-zinc-900 p-2 rounded-xl border border-white/5">
                <label className="text-[8px] uppercase font-black text-lime-500 block mb-1 ml-1">Voice Tone</label>
                <select 
                  value={selectedVoiceURI} 
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="w-full bg-transparent text-[10px] font-bold text-zinc-300 outline-none truncate"
                >
                  {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                </select>
             </div>
          </div>

          <button onClick={toggleAutoTour} className={`w-full py-6 rounded-full font-black text-xl uppercase tracking-tighter transition-all ${autoLoopActive ? 'bg-red-600 shadow-xl' : 'bg-lime-500 text-black shadow-2xl shadow-lime-500/40'}`}>
            {autoLoopActive ? `Stop (${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')})` : 'Begin Discovery'}
          </button>
        </div>
      </main>
    </div>
  );
}