'use client';

import { useState, useEffect, useRef } from 'react';
import MiniMap from './components/MiniMap';

// --- Math Helpers ---
function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin((lon2 - lon1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
  const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
            Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lon2 - lon1) * (Math.PI / 180));
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; 
  const φ1 = lat1 * Math.PI / 180; const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180; const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return Math.round(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
}

const GEMINI_VOICES = [
  { name: 'Journey (Female)', voiceURI: 'en-US-Journey-F', gender: 'FEMALE' },
  { name: 'Journey (Male)', voiceURI: 'en-US-Journey-D', gender: 'MALE' },
  { name: 'Standard (Female)', voiceURI: 'en-US-Standard-C', gender: 'FEMALE' },
  { name: 'Standard (Male)', voiceURI: 'en-US-Standard-D', gender: 'MALE' },
];

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
  const [radius, setRadius] = useState(5000); 
  const [userApiKey, setUserApiKey] = useState("");
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash"); 
  const [isMounted, setIsMounted] = useState(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDiscoveryRef = useRef<number>(0); 
  const lastReverseGeocodeRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { setIsMounted(true); }, []);

  // 🔊 Audio Setup
  useEffect(() => {
    if (!isMounted) return;
    setVoices(GEMINI_VOICES);
    if (!selectedVoiceURI) {
      setSelectedVoiceURI(GEMINI_VOICES[0].voiceURI);
    }
  }, [isMounted]);

  // 🧭 Real-Time Sensor Tracking & Reverse Geocoding
  useEffect(() => {
    if (!isMounted) return;

    const handleOrientation = (e: any) => {
      const currentHeading = e.webkitCompassHeading || (360 - e.alpha) || 0;
      setHeading(currentHeading);
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    
    const watchId = navigator.geolocation.watchPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      setLocation({ lat: latitude, lon: longitude });
      
      // REAL-TIME STREET DETECTION: Check every 10 seconds for a new address
      const now = Date.now();
      if (now - lastReverseGeocodeRef.current > 10000) {
        lastReverseGeocodeRef.current = now;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          const houseNumber = data.address?.house_number ? `${data.address.house_number} ` : '';
          const street = data.address?.road || data.address?.suburb || data.address?.city || "Unknown Path";
          setAddress(`${houseNumber}${street}`.toUpperCase());
        } catch (e) {
          console.error("Geocoding failed", e);
        }
      }

      if (pois.length > 0) {
        const target = pois[0];
        const tLat = target.lat || target.center?.lat;
        const tLon = target.lon || target.center?.lon;
        if (tLat && tLon) {
          const dist = getDistance(latitude, longitude, tLat, tLon);
          const bearing = getBearing(latitude, longitude, tLat, tLon);
          setDistance(dist);
          setArrowRotation(bearing - heading);
        }
      }
    }, (err) => console.error("GPS Error:", err), { enableHighAccuracy: true });

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isMounted, pois, heading]);

  // 🗺️ Discovery Engine (POI Updates)
  useEffect(() => {
    if (!location) return;
    const now = Date.now();
    if (now - lastDiscoveryRef.current < 15000) return; 
    lastDiscoveryRef.current = now;

    fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
    })
    .then(res => res.json())
    .then(data => {
      setPois(data.pois?.length > 0 ? data.pois : [{ name: 'local history', lat: location.lat+0.001, lon: location.lon+0.001 }]);
    });
  }, [location, radius]);

  const speakText = async (text: string) => {
    if (isMuted || typeof window === 'undefined') return;
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI) || GEMINI_VOICES[0];
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: selectedVoice.voiceURI, ssmlGender: selectedVoice.gender })
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
    } catch (e) { console.error("TTS Error", e); }
  };

  const handleNarrate = async () => {
    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pois, locationContext: { street: address }, model: selectedModel, customKey: userApiKey })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || "API Error");
      setCurrentNarration(data.text);
      speakText(data.text);
    } catch (e: any) { setCurrentNarration(`Error: ${e.message}`); }
  };

  const toggleAutoTour = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission !== 'granted') alert("Compass permission denied.");
      } catch (e) { console.error(e); }
    }

    const start = !autoLoopActive;
    setAutoLoopActive(start);
    if (start) {
      handleNarrate();
      countdownIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => { if (prev <= 1) { handleNarrate(); return 120; } return prev - 1; });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      window.speechSynthesis.cancel();
      if (audioRef.current) audioRef.current.pause();
      setTimeLeft(120);
    }
  };

  if (!isMounted) return <div className="min-h-screen bg-black" />;

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 max-w-lg mx-auto font-sans overflow-hidden">
      <MiniMap />
      <header className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h1 className="font-black text-lime-500 text-xl italic uppercase tracking-tighter">3D VOLT TOUR</h1>
          {/* Header shows Real-Time Street + Number */}
          <p className="text-white font-bold text-[10px] mt-1 uppercase bg-zinc-900 px-2 py-0.5 rounded italic border border-white/5">
            📍 {address}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button className="text-[9px] font-black bg-white text-black px-3 py-1 rounded-full uppercase">Google Login</button>
          <button onClick={() => { setIsMuted(!isMuted); if (!isMuted) { window.speechSynthesis.cancel(); if(audioRef.current) audioRef.current.pause(); } }} 
            className={`px-4 py-1.5 rounded-full text-[9px] font-black border uppercase ${isMuted ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-lime-500 text-lime-500 bg-lime-500/10'}`}>
            {isMuted ? '🔇 Muted' : '🔊 Sound On'}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center">
        <div className="relative w-full aspect-square flex flex-col items-center justify-center">
          <div className="transition-transform duration-75 ease-out" style={{ transform: `rotateX(60deg) rotateZ(${arrowRotation}deg)` }}>
            <div className="w-24 h-24 text-lime-400 drop-shadow-[0_0_15px_rgba(163,230,53,1)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="18 15 12 9 6 15" /><polyline points="18 9 12 3 6 9" /></svg>
            </div>
          </div>
          <p className="text-6xl font-mono font-black mt-4 tabular-nums">{distance ?? '--'}m</p>
          <p className="text-[10px] font-black text-lime-500 uppercase tracking-widest">Target Proximity</p>
        </div>

        <div className={`w-full p-6 rounded-[2.5rem] border-2 transition-all min-h-[120px] flex items-center justify-center ${autoLoopActive ? 'border-lime-500 bg-lime-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
          <p className="text-zinc-100 text-center italic">{currentNarration || "Stand by for historical uplink..."}</p>
        </div>

        <div className="w-full mt-4 space-y-3">
          <div className="bg-zinc-900 p-2 rounded-xl border border-white/5">
            <label className="text-[8px] uppercase font-black text-lime-500 block mb-1">Personal API Key</label>
            <input type="password" value={userApiKey} onChange={(e) => setUserApiKey(e.target.value)} placeholder="AIza..." className="w-full bg-transparent text-[10px] font-bold text-zinc-300 outline-none"/>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-900 p-2 rounded-xl border border-white/5">
              <label className="text-[8px] uppercase font-black text-lime-500 block mb-1">AI Model</label>
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full bg-transparent text-[10px] font-bold text-zinc-300 outline-none">
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-3-flash">Gemini 3 Flash</option>
              </select>
            </div>
            <div className="bg-zinc-900 p-2 rounded-xl border border-white/5 relative">
              <label className="text-[8px] uppercase font-black text-lime-500 block mb-1">Narrator</label>
              <div className="flex items-center gap-1">
                <select value={selectedVoiceURI} onChange={(e) => setSelectedVoiceURI(e.target.value)} className="flex-1 bg-transparent text-[10px] font-bold text-zinc-300 outline-none truncate">
                  {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                </select>
                <button onClick={() => speakText("Testing system audio.")} className="text-[10px] bg-lime-500 text-black px-1 rounded font-bold">TEST</button>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 p-3 rounded-xl border border-white/5">
            <div className="flex justify-between mb-1">
               <label className="text-[8px] uppercase font-black text-lime-500">Radar Range</label>
               <span className="text-[8px] font-bold">{radius}M</span>
            </div>
            <input type="range" min="500" max="10000" step="500" value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} className="w-full accent-lime-500" />
          </div>

          <button onClick={toggleAutoTour} className={`w-full py-5 rounded-full font-black text-xl uppercase tracking-tighter transition-all ${autoLoopActive ? 'bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.4)]' : 'bg-lime-500 text-black shadow-[0_0_20px_rgba(163,230,53,0.4)]'}`}>
            {autoLoopActive ? `Stop (${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')})` : 'Begin Discovery'}
          </button>
        </div>
      </main>
    </div>
  );
}