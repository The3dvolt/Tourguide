'use client';

import { useState, useEffect, useRef } from 'react';

// Math Helpers
function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin((lon2 - lon1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
  const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
            Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lon2 - lon1) * (Math.PI / 180));
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
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
  const [factCheckLink, setFactCheckLink] = useState('');
  const [autoLoopActive, setAutoLoopActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isMuted, setIsMuted] = useState(false);
  
  // Voice States
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- 1. Audio Setup & Voice Loading ---
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      const engVoices = v.filter(v => v.lang.startsWith('en'));
      setVoices(engVoices);
      if (engVoices.length > 0 && !selectedVoiceURI) {
        setSelectedVoiceURI(engVoices[0].voiceURI);
      }
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, [selectedVoiceURI]);

  // --- 2. Android & iOS Compass + GPS Logic ---
  useEffect(() => {
    const handleOrientation = (e: any) => {
      let compass = 0;
      if (e.webkitCompassHeading) {
        // iOS Device
        compass = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        // Android Device (Subtract from 360 to sync clockwise rotation)
        compass = 360 - e.alpha;
      }
      setHeading(compass);
    };

    // Listen for orientation (Standard and Android Absolute)
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    } else {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }

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
  }, [pois, heading]);

  // --- 3. Discovery (Street & POIs) ---
  useEffect(() => {
    if (!location) return;
    fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: location.lat, lon: location.lon, radius: 1000 })
    })
    .then(res => res.json())
    .then(data => {
      setPois(data.pois || []);
      if (data.locationContext?.street) setAddress(data.locationContext.street);
    });
  }, [location]);

  // --- 4. Narration & Voice Trigger ---
  const handleNarrate = async () => {
    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pois, 
          locationContext: { street: address }, 
          model: "gemini-2.5-flash" 
        })
      });
      const data = await res.json();
      const parts = data.text.split(/LINK:/i);
      const story = parts[0].replace(/STORY:/i, '').trim();
      const link = parts[1]?.trim() || '';

      setCurrentNarration(story);
      setFactCheckLink(link);

      if (!isMuted) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(story);
        const v = voices.find(x => x.voiceURI === selectedVoiceURI);
        if (v) u.voice = v;
        window.speechSynthesis.speak(u);
      }
    } catch (e) { console.error(e); }
  };

  const toggleAutoTour = async () => {
    // Permission for iOS (Android will ignore this)
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      await (DeviceOrientationEvent as any).requestPermission();
    }
    const start = !autoLoopActive;
    setAutoLoopActive(start);
    if (start) {
      handleNarrate();
      countdownIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { handleNarrate(); return 30; }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      window.speechSynthesis.cancel();
      setTimeLeft(30);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 max-w-lg mx-auto font-sans overflow-hidden">
      <header className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h1 className="font-black text-lime-500 text-xl italic tracking-tighter uppercase leading-none">3D VOLT TOUR</h1>
          <p className="text-white font-bold text-[10px] mt-1 uppercase tracking-widest bg-zinc-900 w-fit px-2 py-0.5 rounded">
            {address}
          </p>
        </div>
        <button onClick={() => {
          setIsMuted(!isMuted);
          if (!isMuted) window.speechSynthesis.cancel();
        }} className={`px-4 py-2 rounded-full text-[9px] font-black border uppercase transition-all ${isMuted ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-lime-500 text-lime-500 bg-lime-500/10'}`}>
          {isMuted ? '🔇 Muted' : '🔊 Sound On'}
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center">
        {/* Navigation Display */}
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

        {/* Story Display */}
        <div className={`w-full mt-2 p-6 rounded-[2.5rem] border-2 transition-all duration-700 relative ${autoLoopActive ? 'border-lime-500 bg-lime-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
          <p className="text-zinc-100 text-lg font-medium italic text-center leading-snug">
            {currentNarration || "Calibrating historical vectors..."}
          </p>
          {factCheckLink && (
            <a href={factCheckLink} target="_blank" className="mt-4 mx-auto block w-max bg-lime-500 text-black px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest">
              Verify Fact ↗
            </a>
          )}
        </div>

        {/* Voice Selector & Test Button */}
        <div className="w-full mt-4 space-y-3">
          <div className="flex gap-2 bg-zinc-900 p-2 rounded-2xl border border-white/5">
            <select 
              value={selectedVoiceURI} 
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              className="flex-1 bg-transparent p-2 text-xs font-bold text-zinc-400 outline-none"
            >
              {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
            </select>
            <button 
              onClick={() => {
                const u = new SpeechSynthesisUtterance("System audio active.");
                const v = voices.find(x => x.voiceURI === selectedVoiceURI);
                if(v) u.voice = v;
                window.speechSynthesis.speak(u);
              }}
              className="bg-lime-500/20 text-lime-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-lime-500/30"
            >
              Test
            </button>
          </div>

          <button onClick={toggleAutoTour} className={`w-full py-6 rounded-full font-black text-xl uppercase tracking-tighter transition-all ${autoLoopActive ? 'bg-red-600 shadow-xl' : 'bg-lime-500 text-black shadow-2xl shadow-lime-500/40'}`}>
            {autoLoopActive ? `Halt Tour (${timeLeft}s)` : 'Begin Auto-Tour'}
          </button>
        </div>
      </main>
    </div>
  );
}