'use client';

import { useState, useEffect, useRef } from 'react';

// Helper: Math for Navigation
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
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return Math.round(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))));
}

export default function TourGuidePage() {
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [heading, setHeading] = useState(0); 
  const [pois, setPois] = useState<any[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [arrowRotation, setArrowRotation] = useState(0);
  const [currentNarration, setCurrentNarration] = useState('');
  const [autoLoopActive, setAutoLoopActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isMuted, setIsMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Audio Setup ---
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      const eng = v.filter(v => v.lang.startsWith('en'));
      setVoices(eng);
      if (eng.length > 0 && !selectedVoiceURI) setSelectedVoiceURI(eng[0].voiceURI);
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, [selectedVoiceURI]);

  // --- Mute Logic Fix ---
  useEffect(() => {
    if (isMuted) window.speechSynthesis.cancel();
  }, [isMuted]);

  const speak = (text: string) => {
    if (isMuted) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find(x => x.voiceURI === selectedVoiceURI);
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  };

  // --- Sensors (Compass & GPS) ---
  useEffect(() => {
    const handleOrientation = (e: any) => {
      const compass = e.webkitCompassHeading || (360 - e.alpha);
      if (compass) setHeading(compass);
    };
    window.addEventListener('deviceorientation', handleOrientation, true);

    const watchId = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setLocation({ lat: latitude, lon: longitude });
      if (pois.length > 0) {
        const t = pois[0];
        const tLat = t.lat || t.center?.lat;
        const tLon = t.lon || t.center?.lon;
        if (tLat && tLon) {
          setDistance(getDistance(latitude, longitude, tLat, tLon));
          setArrowRotation(getBearing(latitude, longitude, tLat, tLon) - heading);
        }
      }
    }, null, { enableHighAccuracy: true });

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [pois, heading]);

  // --- Discovery & Narration ---
  useEffect(() => {
    if (!location) return;
    fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: location.lat, lon: location.lon, radius: 2000 })
    })
    .then(res => res.json())
    .then(data => setPois(data.pois || []));
  }, [location]);

  const handleNarrate = async () => {
    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pois, model: "gemini-2.5-flash" })
      });
      const data = await res.json();
      const story = data.text.split(/LINK:/i)[0].replace(/STORY:/i, '').trim();
      setCurrentNarration(story);
      speak(story);
    } catch (e) { console.error(e); }
  };

  const toggleAutoTour = async () => {
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
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 max-w-lg mx-auto overflow-hidden font-sans">
      <header className="flex justify-between items-center mb-6">
        <h1 className="font-black text-lime-500 text-xl italic tracking-tighter">3D VOLT TOUR</h1>
        <button 
          onClick={() => setIsMuted(!isMuted)} 
          className={`px-5 py-2 rounded-full text-[10px] font-black border uppercase transition-all ${isMuted ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-lime-500 text-lime-500 bg-lime-500/10'}`}
        >
          {isMuted ? '🔇 Muted' : '🔊 Sound On'}
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center space-y-8">
        {/* 3D ARROW BOX */}
        <div className="relative w-full aspect-square flex flex-col items-center justify-center pt-10">
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
             <div className="w-64 h-64 border-2 border-lime-500 rounded-full blur-xl animate-pulse" />
          </div>

          {/* Perspective Container */}
          <div style={{ perspective: '1000px' }} className="relative z-10">
            <div 
              className="transition-transform duration-300 ease-out"
              style={{ transform: `rotateX(55deg) rotateZ(${arrowRotation}deg)` }}
            >
              {/* The "Neon" Arrow */}
              <div className="relative flex flex-col items-center">
                <div className="w-24 h-24 text-lime-400 drop-shadow-[0_0_15px_rgba(163,230,53,0.8)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                    <polyline points="18 9 12 3 6 9" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center z-20">
            <p className="text-4xl font-mono font-black tracking-tight text-white drop-shadow-md">
              {distance !== null ? `${distance}m` : '--'}
            </p>
            <p className="text-[10px] font-black text-lime-500 uppercase tracking-[0.4em] mt-1">Distance to Discovery</p>
          </div>
        </div>

        {/* NARRATION WINDOW */}
        <div className={`w-full p-8 rounded-[3rem] border-2 transition-all duration-700 ${autoLoopActive ? 'border-lime-500 bg-lime-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
          {autoLoopActive && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-lime-500 text-black px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
              Live Update: {timeLeft}s
            </div>
          )}
          <p className="text-zinc-100 text-lg font-medium italic text-center leading-relaxed">
            {currentNarration || "Align with the arrow to uncover the history beneath your feet."}
          </p>
        </div>

        {/* UI CONTROLS */}
        <div className="w-full space-y-4 pb-8">
          <div className="flex gap-2">
            <select 
              value={selectedVoiceURI} 
              onChange={(e) => setSelectedVoiceURI(e.target.value)} 
              className="flex-1 bg-zinc-900 border border-white/10 p-4 rounded-2xl text-xs font-bold text-zinc-400 outline-none"
            >
              {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
            </select>
            <button onClick={() => speak("Voice test active.")} className="bg-lime-500/10 text-lime-500 border border-lime-500/20 px-6 rounded-2xl font-black text-[10px] uppercase">Test</button>
          </div>
          
          <button 
            onClick={toggleAutoTour} 
            className={`w-full py-7 rounded-full font-black text-xl uppercase tracking-tighter transition-all ${autoLoopActive ? 'bg-red-600' : 'bg-lime-500 text-black shadow-2xl shadow-lime-500/30'}`}
          >
            {autoLoopActive ? 'Halt Tour' : 'Begin Auto-Tour'}
          </button>
        </div>
      </main>
    </div>
  );
}