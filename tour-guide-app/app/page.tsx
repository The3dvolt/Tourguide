'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface POI {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  distance: number;
}

interface LocationContext {
  street: string;
  city: string;
  state: string;
  country: string;
  fullAddress: string;
}

export default function TourGuidePage() {
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [heading, setHeading] = useState(0);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<LocationContext | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const [currentNarration, setCurrentNarration] = useState('');
  const [interests] = useState(['history', 'architecture', 'culture', 'news']);
  const [radius, setRadius] = useState(1500); // Higher default radius
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('Syncing GPS...');
  
  const lastFetchLocation = useRef<{lat: number, lon: number} | null>(null);

  // --- Helper: Distance Calculation (To prevent flicker) ---
  const getDistance = (l1: {lat: number, lon: number}, l2: {lat: number, lon: number}) => {
    const R = 6371e3;
    const p1 = l1.lat * Math.PI / 180;
    const p2 = l2.lat * Math.PI / 180;
    const dp = (l2.lat - l1.lat) * Math.PI / 180;
    const dl = (l2.lon - l1.lon) * Math.PI / 180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // --- iOS Voice Unlock ---
  const unlockAudio = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(' ');
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const speakText = (text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  // --- Geolocation Tracking ---
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newLoc = { lat: position.coords.latitude, lon: position.coords.longitude };
        // Only trigger state change if user moves more than 15 meters to prevent flickering
        if (!lastFetchLocation.current || getDistance(lastFetchLocation.current, newLoc) > 15) {
          setLocation(newLoc);
          lastFetchLocation.current = newLoc;
        }
      },
      (err) => setError(`GPS Error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  
  // --- Compass Tracking ---
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) setHeading(event.alpha);
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);
  
  // --- Discovery API ---
  useEffect(() => {
    if (!location) return;
    
    const discover = async () => {
      try {
        setDebugInfo('Updating sector markers...');
        const response = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
        });
        const data = await response.json();
        if (data.pois) setPois(data.pois);
        if (data.locationContext) {
          setLocationContext(data.locationContext);
          setDebugInfo(`Near: ${data.locationContext.street}`);
        }
      } catch (err) { 
        setDebugInfo('Discovery sync error');
      }
    };
    
    discover();
  }, [location, radius]);
  
  const handleNarrateClick = async () => {
    if (isNarrating) return;
    if (voiceEnabled) unlockAudio(); // Unlock iPhone speech on click

    setIsNarrating(true);
    setCurrentNarration('🔍 Searching historical records...');
    
    try {
      const response = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pois, locationContext, interests })
      });
      const data = await response.json();
      if (data.text) {
        setCurrentNarration(data.text);
        speakText(data.text);
      }
    } catch (err) {
      setCurrentNarration("Error connecting to guide brain.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white font-sans overflow-x-hidden">
      {/* Top Header & Settings */}
      <header className="p-4 bg-slate-900/90 border-b border-white/10 sticky top-0 z-[100] backdrop-blur-md">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-black tracking-tighter text-blue-400">3D VOLT TOUR</h1>
          <button 
            onClick={() => {
              setVoiceEnabled(!voiceEnabled);
              if (!voiceEnabled) unlockAudio();
            }}
            className={`px-4 py-2 rounded-full text-[10px] font-black transition-all border ${
              voiceEnabled ? 'bg-green-600 border-green-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {voiceEnabled ? '🔊 VOICE ON' : '🔇 VOICE OFF'}
          </button>
        </div>

        {/* Top Radius Slider */}
        <div className="bg-black/30 p-3 rounded-xl border border-white/5">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
            <span>Scan Radius</span>
            <span className="text-blue-400">{radius}m</span>
          </div>
          <input 
            type="range" min="100" max="3000" step="100" 
            value={radius} 
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Status Bar */}
        <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
          <span>{debugInfo}</span>
          <span>{Math.round(heading)}° Heading</span>
        </div>

        {/* Main Address Card */}
        <section className="bg-gradient-to-br from-slate-800 to-black p-5 rounded-3xl border border-white/10 shadow-2xl">
          <h2 className="text-[10px] font-bold text-blue-500 uppercase mb-1">Current Sector</h2>
          <p className="text-2xl font-bold leading-tight mb-1">
            {locationContext?.street || 'Detecting Street...'}
          </p>
          <p className="text-sm text-slate-400">
            {locationContext?.city}, {locationContext?.state}
          </p>
        </section>

        {/* Narrative Box - Larger Text for Easy Reading */}
        <section className={`p-6 rounded-3xl border-2 transition-all duration-700 ${isNarrating ? 'border-blue-500 bg-blue-600/10' : 'border-white/5 bg-slate-900/50'}`}>
          <div className="flex items-center gap-2 mb-4">
            <span className={`w-2 h-2 rounded-full ${isNarrating ? 'bg-blue-400 animate-ping' : 'bg-slate-700'}`}></span>
            <h3 className="text-xs font-black text-slate-500 uppercase">Archive Content</h3>
          </div>
          <p className="text-xl md:text-2xl font-medium leading-relaxed text-slate-100">
            {currentNarration || "Stand near a location and press the button to reveal local history and secrets."}
          </p>
        </section>

        {/* Action Button */}
        <button 
          onClick={handleNarrateClick}
          disabled={isNarrating}
          className="w-full py-6 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-3xl font-black text-lg tracking-widest shadow-2xl shadow-blue-600/20 active:scale-95 transition-all"
        >
          {isNarrating ? 'CONSULTING AI...' : 'NARRATE THIS SECTOR'}
        </button>

        {/* Markers List */}
        <section className="pt-4">
          <h3 className="text-xs font-black text-slate-600 uppercase mb-4 px-1">Nearby Markers ({pois.length})</h3>
          <div className="space-y-3">
            {pois.length > 0 ? (
              pois.slice(0, 5).map((poi) => (
                <div key={poi.id} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-slate-200">{poi.name}</h4>
                    <p className="text-[10px] text-slate-500 uppercase font-black">{poi.type}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-400">{Math.round(poi.distance)}m</span>
                </div>
              ))
            ) : (
              <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-3xl">
                <p className="text-sm text-slate-600 font-bold uppercase">No physical markers. Using city-level data.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {error && (
        <div className="fixed bottom-4 left-4 right-4 bg-red-600 text-white p-3 rounded-xl text-center text-xs font-bold z-[1000]">
          {error}
        </div>
      )}
    </div>
  );
}