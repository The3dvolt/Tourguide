'use client';

import { useState, useEffect, useRef } from 'react';

export default function TourGuidePage() {
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [heading, setHeading] = useState(0);
  const [pois, setPois] = useState([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const [currentNarration, setCurrentNarration] = useState('');
  const [radius, setRadius] = useState(2500); 
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [error, setError] = useState('');

  // --- IPHONE VOICE UNLOCK ---
  const speakText = (text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  // Immediate "unlock" for iOS Safari
  const unlockAudio = () => {
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  };

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => setError("Please enable GPS"),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!location) return;
    const discover = async () => {
      try {
        const res = await fetch('/api/discover', {
          method: 'POST',
          body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
        });
        const data = await res.json();
        setPois(data.pois || []);
        setLocationContext(data.locationContext || null);
      } catch (e) { console.error(e); }
    };
    discover();
  }, [location, radius]);

  const handleNarrate = async () => {
    if (isNarrating) return;
    if (voiceEnabled) unlockAudio(); // Vital for iPhone

    setIsNarrating(true);
    setCurrentNarration('Consulting digital archives...');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        body: JSON.stringify({ pois, locationContext })
      });
      const data = await res.json();
      if (data.text) {
        setCurrentNarration(data.text);
        speakText(data.text);
      }
    } catch (e) {
      setCurrentNarration("System connection interrupted.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#050505] text-white">
      {/* HEADER WITH RADAR AT TOP */}
      <header className="p-4 bg-[#0a0a0a] border-b border-white/10 sticky top-0 z-50">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-black text-blue-500 tracking-tighter">3D VOLT TOUR</h1>
          <button 
            onClick={() => {
              setVoiceEnabled(!voiceEnabled);
              if (!voiceEnabled) unlockAudio();
            }}
            className={`px-4 py-2 rounded-full text-[10px] font-bold border ${voiceEnabled ? 'bg-green-600 border-green-400' : 'bg-slate-800 border-slate-700'}`}
          >
            {voiceEnabled ? '🔊 VOICE ON' : '🔇 VOICE OFF'}
          </button>
        </div>

        {/* RADAR RANGE AT THE TOP */}
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
          <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase mb-2">
            <span>Radar Range</span>
            <span className="text-blue-400">{radius}m</span>
          </div>
          <input 
            type="range" min="100" max="5000" step="100" 
            value={radius} 
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none accent-blue-500"
          />
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Location Display */}
        <section className="bg-slate-900/50 p-5 rounded-3xl border border-white/5 shadow-2xl">
          <h2 className="text-[10px] text-blue-500 font-bold uppercase mb-1">Current Sector</h2>
          <p className="text-2xl font-black leading-none mb-1">
            {locationContext?.street || 'Scanning...'}
          </p>
          <p className="text-sm text-slate-400 font-medium">
            {locationContext?.city}, {locationContext?.state}
          </p>
        </section>

        {/* Archive Content Box (Typing Box) */}
        <section className={`p-6 rounded-3xl border-2 transition-all duration-700 min-h-[200px] ${isNarrating ? 'border-blue-500 bg-blue-500/5' : 'border-white/10 bg-[#0a0a0a]'}`}>
          <div className="flex items-center gap-2 mb-4">
            <span className={`w-2 h-2 rounded-full ${isNarrating ? 'bg-blue-500 animate-ping' : 'bg-slate-700'}`}></span>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Archive Content</h3>
          </div>
          <p className="text-xl font-medium leading-relaxed text-slate-200">
            {currentNarration || "System ready. Press Narrate to explore local history."}
          </p>
        </section>

        <button 
          onClick={handleNarrate}
          disabled={isNarrating}
          className="w-full py-6 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-3xl font-black text-lg tracking-widest shadow-2xl active:scale-95 transition-all"
        >
          {isNarrating ? 'CONSULTING AI...' : 'NARRATE NOW'}
        </button>

        {/* Markers Found List */}
        <section>
          <h3 className="text-[10px] font-black text-slate-600 uppercase mb-4 px-1">Markers in sector</h3>
          <div className="space-y-3">
            {pois.length > 0 ? (
              pois.slice(0, 3).map((poi: any) => (
                <div key={poi.id} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                  <div className="max-w-[70%]">
                    <h4 className="font-bold text-slate-200 truncate">{poi.name}</h4>
                    <p className="text-[10px] text-slate-500 uppercase font-black">{poi.type}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-400">{Math.round(poi.distance)}m</span>
                </div>
              ))
            ) : (
              <p className="text-center text-xs text-slate-700 font-bold uppercase py-4">No markers nearby. Using city-level data.</p>
            )}
          </div>
        </section>
      </main>

      {error && <div className="fixed bottom-4 left-4 right-4 bg-red-600 p-3 rounded-2xl text-center text-xs font-bold">{error}</div>}
    </div>
  );
}