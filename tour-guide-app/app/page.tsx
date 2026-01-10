'use client';

import { useState, useEffect, useRef } from 'react';

interface POI {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  description: string;
  distance: number;
  bearing: number;
}

interface LocationContext {
  street: string;
  city: string;
  state: string;
  country: string;
  fullAddress: string;
}

export default function TourGuidePage() {
  // State Management
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [heading, setHeading] = useState(0);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<LocationContext | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const [currentNarration, setCurrentNarration] = useState('');
  const [interests] = useState(['history', 'architecture', 'local news', 'culture']);
  const [radius, setRadius] = useState(500);
  const [autoMode, setAutoMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  
  const lastNarrationTime = useRef(0);

  // --- iOS VOICE FIX: Unlock Speech Engine ---
  // On iOS, speech must be "primed" by a direct user gesture.
  const unlockVoice = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance('');
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const speakText = (text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Professional tour guide pace
    utterance.pitch = 1.0;
    
    // Attempt to find a natural sounding voice
    const voices = window.speechSynthesis.getVoices();
    const premiumVoice = voices.find(v => v.localService && v.name.includes('Google')) || voices[0];
    if (premiumVoice) utterance.voice = premiumVoice;

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
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
        setError('');
      },
      (err) => setError(`Location error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
    
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  
  // --- Heading / Compass Tracking ---
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) setHeading(event.alpha);
    };
    
    // Handle iOS orientation permissions
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission();
    }
    
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);
  
  // --- Discovery API (Street/City/POI context) ---
  useEffect(() => {
    if (!location) return;
    
    const discover = async () => {
      try {
        setDebugInfo('Syncing with local archives...');
        const response = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
        });
        
        const data = await response.json();
        setPois(data.pois || []);
        setLocationContext(data.locationContext || null);
        setDebugInfo(data.locationContext ? `At: ${data.locationContext.street}` : 'Scanning...');
      } catch (err) {
        setDebugInfo('Discovery offline');
      }
    };
    
    discover();
    const interval = setInterval(discover, 30000);
    return () => clearInterval(interval);
  }, [location, radius]);
  
  // --- Narration Logic ---
  const narrate = async () => {
    if (isNarrating) return;
    
    // CRITICAL: Unlock voice immediately on user click (for iPhone)
    if (voiceEnabled) unlockVoice();

    setIsNarrating(true);
    setCurrentNarration('🔍 Consulting history for this location...');
    lastNarrationTime.current = Date.now();
    
    try {
      const response = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pois,
          locationContext, // Hierarchical context: Street -> City -> Province
          interests 
        }),
      });
      
      const data = await response.json();
      
      if (data.text) {
        setCurrentNarration(data.text);
        // Delay slightly for mobile Safari stability
        setTimeout(() => speakText(data.text), 100);
      }
    } catch (err) {
      setCurrentNarration("I'm looking into the rich history of this region. Every corner has a story...");
    } finally {
      setIsNarrating(false);
    }
  };

  // --- UI ---
  return (
    <div className="flex flex-col min-h-screen bg-[#0f172a] text-white font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-lg sticky top-0 z-50 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black tracking-tighter bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent uppercase">
            3D Volt Tour
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{debugInfo}</p>
        </div>
        
        <button 
          onClick={() => {
            setVoiceEnabled(!voiceEnabled);
            if (!voiceEnabled) unlockVoice();
            else window.speechSynthesis.cancel();
          }}
          className={`px-4 py-2 rounded-full text-[10px] font-black tracking-widest transition-all ${
            voiceEnabled 
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
              : 'bg-slate-800 text-slate-400 grayscale'
          }`}
        >
          {voiceEnabled ? '🔊 VOICE ON' : '🔇 VOICE OFF'}
        </button>
      </header>

      <main className="flex-1 p-5 space-y-6 max-w-xl mx-auto w-full">
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 p-3 rounded-xl text-red-400 text-xs text-center">
            {error}
          </div>
        )}

        {/* Address Card */}
        <section className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-3xl border border-slate-700/50 shadow-2xl">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Sector</h2>
              <p className="text-xl font-bold text-white truncate max-w-[200px]">
                {locationContext?.street || 'Detecting Street...'}
              </p>
              <p className="text-sm text-blue-400 font-medium">
                {locationContext?.city}, {locationContext?.state}
              </p>
            </div>
            <div className="bg-black/40 p-3 rounded-2xl border border-white/5 text-center min-w-[70px]">
              <span className="text-[9px] text-slate-500 block font-bold">COMPASS</span>
              <span className="text-xl font-mono font-black text-blue-400">{Math.round(heading)}°</span>
            </div>
          </div>
        </section>

        {/* AI Story Box */}
        <section className="relative group">
          <div className={`transition-all duration-700 rounded-3xl p-6 border ${
            isNarrating ? 'bg-blue-600/10 border-blue-500 shadow-blue-500/20' : 'bg-slate-800/40 border-slate-700'
          } shadow-2xl`}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`flex h-2 w-2 rounded-full ${isNarrating ? 'bg-blue-400 animate-ping' : 'bg-slate-600'}`}></span>
              <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Local Knowledge</h3>
            </div>
            <p className="text-lg leading-relaxed font-medium text-slate-200 italic">
              "{currentNarration || `I'm ready to tell you about the secrets of ${locationContext?.city || 'this area'}. Press Narrate to begin.`}"
            </p>
          </div>
        </section>

        {/* Main Controls */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => setAutoMode(!autoMode)}
            className={`py-4 rounded-2xl font-black text-[11px] tracking-widest transition-all ${
              autoMode 
                ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' 
                : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}
          >
            {autoMode ? 'AUTO: ACTIVE' : 'AUTO: OFF'}
          </button>
          <button 
            onClick={narrate}
            disabled={isNarrating}
            className="py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-2xl font-black text-[11px] tracking-widest shadow-xl shadow-blue-600/30 active:scale-95 transition-transform"
          >
            {isNarrating ? 'SYNCING...' : 'NARRATE NOW'}
          </button>
        </div>

        {/* Discovery Feed */}
        <section className="pt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nearby Signatures</h3>
            <div className="h-[1px] flex-1 mx-4 bg-slate-800"></div>
          </div>
          <div className="space-y-3">
            {pois.length > 0 ? (
              pois.slice(0, 3).map((poi) => (
                <div key={poi.id} className="bg-slate-800/30 p-4 rounded-2xl border border-slate-700/30 flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-bold text-slate-300">{poi.name}</h4>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">{poi.type}</p>
                  </div>
                  <div className="text-xs font-mono font-bold text-blue-400">
                    {Math.round(poi.distance)}m
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center border-2 border-dashed border-slate-800 rounded-3xl">
                <p className="text-xs text-slate-600 font-bold uppercase tracking-tighter">
                  No landmarks. Using street-level archives.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer Settings */}
      <footer className="p-8 bg-black/40 border-t border-slate-800 mt-auto">
        <div className="max-w-xl mx-auto space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Radar Range</span>
            <span className="text-xs font-mono font-bold text-blue-400">{radius}m</span>
          </div>
          <input 
            type="range" min="100" max="2000" step="100" 
            value={radius} 
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </footer>
    </div>
  );
}