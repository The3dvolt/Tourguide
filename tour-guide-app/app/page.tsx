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
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return Math.round(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))));
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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- 1. Audio Setup ---
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v.filter(v => v.lang.startsWith('en')));
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, []);

  // --- 2. GPS & Compass Tracker ---
  useEffect(() => {
    const handleOrientation = (e: any) => {
      const compass = e.webkitCompassHeading || (360 - e.alpha);
      if (compass) setHeading(compass);
    };
    window.addEventListener('deviceorientation', handleOrientation, true);

    const watchId = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setLocation({ lat: latitude, lon: longitude });

      // Update distance if POIs exist
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
      window.removeEventListener('deviceorientation', handleOrientation);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [pois, heading]);

  // --- 3. Street Name & POI Discovery ---
  useEffect(() => {
    if (!location) return;
    
    // Fetch Street Name & Local POIs
    fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: location.lat, lon: location.lon, radius: 1000 })
    })
    .then(res => res.json())
    .then(data => {
      setPois(data.pois || []);
      if (data.locationContext?.street) {
        setAddress(data.locationContext.street);
      }
    });
  }, [location]);

  // --- 4. Historical Narration ---
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
      
      // Parse Story and Link
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
      clearInterval(countdownIntervalRef.current!);
      window.speechSynthesis.cancel();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 max-w-lg mx-auto font-sans">
      <header className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h1 className="font-black text-lime-500 text-xl italic tracking-tighter uppercase leading-none">3D VOLT TOUR</h1>
          <p className="text-white font-bold text-xs mt-1 uppercase tracking-wider">{address}</p>
        </div>
        <button onClick={() => setIsMuted(!isMuted)} className={`px-4 py-2 rounded-full text-[9px] font-black border uppercase transition-all ${isMuted ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-lime-500 text-lime-500 bg-lime-500/10'}`}>
          {isMuted ? '🔇 Muted' : '🔊 Sound On'}
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center">
        {/* Navigation Display */}
        
        <div className="relative w-full aspect-square flex flex-col items-center justify-center">
          <div style={{ perspective: '1000px' }} className="relative z-10">
            <div className="transition-transform duration-200" style={{ transform: `rotateX(60deg) rotateZ(${arrowRotation}deg)` }}>
              <div className="w-24 h-24 text-lime-400 drop-shadow-[0_0_15px_rgba(163,230,53,1)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" /><polyline points="18 9 12 3 6 9" />
                </svg>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-5xl font-mono font-black tabular-nums">{distance !== null ? `${distance}m` : '--'}</p>
            <p className="text-[10px] font-black text-lime-500 uppercase tracking-[0.4em]">Distance to Target</p>
          </div>
        </div>

        {/* Story Display */}
        <div className={`w-full mt-4 p-6 rounded-[2.5rem] border-2 transition-all duration-700 relative ${autoLoopActive ? 'border-lime-500 bg-lime-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
          <p className="text-zinc-100 text-lg font-medium italic text-center leading-relaxed">
            {currentNarration || "Calibrating history for this location..."}
          </p>
          {factCheckLink && (
            <a href={factCheckLink} target="_blank" className="mt-4 mx-auto block w-max bg-lime-500 text-black px-4 py-2 rounded-full text-[9px] font-black uppercase">
              Verify Fact ↗
            </a>
          )}
        </div>

        <button onClick={toggleAutoTour} className={`w-full mt-auto py-6 rounded-full font-black text-xl uppercase tracking-tighter transition-all ${autoLoopActive ? 'bg-red-600' : 'bg-lime-500 text-black shadow-2xl shadow-lime-500/40'}`}>
          {autoLoopActive ? `Halt (${timeLeft}s)` : 'Begin Auto-Tour'}
        </button>
      </main>
    </div>
  );
}