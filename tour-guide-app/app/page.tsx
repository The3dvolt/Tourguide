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
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [heading, setHeading] = useState(0);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<LocationContext | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const [currentNarration, setCurrentNarration] = useState('');
  const [interests, setInterests] = useState(['history', 'architecture', 'culture', 'news']);
  const [radius, setRadius] = useState(500);
  const [autoMode, setAutoMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false); // Voice Toggle
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastNarrationTime = useRef(0);

  // --- Voice Synthesis Function ---
  const speakText = (text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95; // Natural speed
    utterance.pitch = 1.0;
    
    // Optional: Select a specific voice (English/French based on location)
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Female'));
    if (preferredVoice) utterance.voice = preferredVoice;

    window.speechSynthesis.speak(utterance);
  };

  // Request location permission
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
  
  // Track device heading
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) setHeading(event.alpha);
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);
  
  // Discover nearby context (Street, City, POIs)
  useEffect(() => {
    if (!location) return;
    
    const discoverPOIs = async () => {
      try {
        setDebugInfo(`Consulting local records for ${location.lat.toFixed(3)}...`);
        const response = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: location.lat,
            lon: location.lon,
            radius,
            interests
          })
        });
        
        const data = await response.json();
        setPois(data.pois || []);
        setLocationContext(data.locationContext || null);
        
        if (data.locationContext) {
          setDebugInfo(`Located: ${data.locationContext.street}, ${data.locationContext.city}`);
        }
      } catch (err) {
        setDebugInfo('Discovery sync failed');
      }
    };
    
    discoverPOIs();
    const interval = setInterval(discoverPOIs, 30000);
    return () => clearInterval(interval);
  }, [location, radius, interests]);
  
  // Auto-narration trigger
  useEffect(() => {
    if (!autoMode || isNarrating) return;
    const now = Date.now();
    if (now - lastNarrationTime.current > 20000) {
      narrate();
    }
  }, [autoMode, isNarrating, locationContext]);

  // Generate and play narration
  const narrate = async () => {
    if (isNarrating) return;
    
    setIsNarrating(true);
    setCurrentNarration('🔍 Searching historical archives and news...');
    lastNarrationTime.current = Date.now();
    
    try {
      const narrationResponse = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pois,
          locationContext, // Sending Street/City/Province to AI
          location,
          heading,
          interests
        }),
      });
      
      const data = await narrationResponse.json();
      
      if (data.text) {
        setCurrentNarration(data.text);
        speakText(data.text); // Trigger the Voice Narration
      }
    } catch (err) {
      setCurrentNarration('I am observing the surroundings. The history of this region is quite fascinating...');
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-white font-sans">
      <header className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            3D Volt Tour Guide
          </h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">{debugInfo}</p>
        </div>
        
        <button 
          onClick={() => {
            setVoiceEnabled(!voiceEnabled);
            if (voiceEnabled) window.speechSynthesis.cancel();
          }}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
            voiceEnabled 
              ? 'bg-green-500/20 border-green-500 text-green-400' 
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          {voiceEnabled ? '🔊 VOICE ON' : '🔇 VOICE OFF'}
        </button>
      </header>

      <main className="flex-1 p-4 space-y-4 max-w-2xl mx-auto w-full">
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-lg text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Location Display */}
        <section className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 shadow-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-sm font-bold text-slate-500 uppercase">Current Address</h2>
              <p className="text-lg font-medium text-slate-200">
                {locationContext?.street || 'Scanning Street...'}
              </p>
              <p className="text-sm text-blue-400">
                {locationContext?.city}, {locationContext?.state}
              </p>
            </div>
            <div className="bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-700 text-center">
              <span className="text-[10px] text-slate-500 block">HEADING</span>
              <span className="text-lg font-mono font-bold text-emerald-400">{Math.round(heading)}°</span>
            </div>
          </div>
        </section>

        {/* Narration Display */}
        <section className="relative">
          <div className={`transition-all duration-500 bg-blue-600/10 rounded-2xl border ${isNarrating ? 'border-blue-500/50 animate-pulse' : 'border-blue-500/30'} p-5 shadow-2xl shadow-blue-500/5`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${isNarrating ? 'bg-blue-400' : 'bg-slate-600'}`} />
              <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest">Guide Narration</h3>
            </div>
            <p className="text-lg leading-relaxed text-slate-200 min-h-[100px]">
              {currentNarration || "Stand near a landmark or click 'Narrate' to hear about this area's secrets."}
            </p>
          </div>
        </section>

        {/* Action Controls */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => setAutoMode(!autoMode)}
            className={`py-4 rounded-2xl font-bold text-sm transition-all border ${
              autoMode 
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/10' 
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {autoMode ? 'AUTO MODE: ON' : 'AUTO MODE: OFF'}
          </button>
          <button 
            onClick={narrate}
            disabled={isNarrating}
            className="py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            {isNarrating ? 'CONSULTING...' : 'NARRATE NOW'}
          </button>
        </div>

        {/* POI List */}
        <section className="pt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Markers in sector</h3>
            <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full border border-slate-700">
              {pois.length} FOUND
            </span>
          </div>
          <div className="space-y-2">
            {pois.length > 0 ? (
              pois.slice(0, 5).map((poi) => (
                <div key={poi.id} className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/30 flex justify-between items-center group hover:bg-slate-800/50 transition-colors">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">{poi.name}</h4>
                    <p className="text-[10px] text-slate-500 capitalize">{poi.type.replace('_', ' ')}</p>
                  </div>
                  <div className="text-[10px] font-mono text-blue-400 bg-blue-400/5 px-2 py-1 rounded-md border border-blue-400/20">
                    {Math.round(poi.distance)}m
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded-2xl">
                <p className="text-slate-600 text-sm italic">Broadening search to street & city level...</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="p-6 bg-slate-950/50 border-t border-slate-800">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-slate-500 uppercase">Detection Radius</span>
            <span className="text-xs font-bold text-blue-400">{radius}m</span>
          </div>
          <input 
            type="range" min="100" max="2500" step="100" 
            value={radius} 
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </footer>
    </div>
  );
}