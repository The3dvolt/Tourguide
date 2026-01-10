'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export default function TourGuidePage() {
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [heading, setHeading] = useState(0);
  const [pois, setPois] = useState([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const [currentNarration, setCurrentNarration] = useState('');
  const [radius, setRadius] = useState(2000); // Higher default
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [error, setError] = useState('');

  // --- iOS VOICE UNLOCK (Crucial for iPhone) ---
  const speakText = (text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    
    // Cancel previous
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.volume = 1.0;
    
    // iOS Safari Fix: Must be called inside a timeout or direct event
    window.speechSynthesis.speak(utterance);
  };

  // --- Location Tracking ---
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => setError("Enable GPS in your settings"),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- Discovery (Find Address & POIs) ---
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

  // --- Narrate Button Logic ---
  const handleNarrate = async () => {
    if (isNarrating) return;

    // IPHONE FIX: "Unlock" the voice engine immediately on the click
    if (voiceEnabled) {
      const unlock = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(unlock);
    }

    setIsNarrating(true);
    setCurrentNarration('Consulting archives...');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        body: JSON.stringify({ pois, locationContext, interests: ['history', 'news'] })
      });
      const data = await res.json();
      if (data.text) {
        setCurrentNarration(data.text);
        speakText(data.text);
      }
    } catch (e) {
      setCurrentNarration("Error connecting to AI.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-0">
      {/* HEADER WITH RADAR RANGE AT TOP */}
      <header className="p-4 bg-slate-900 border-b border-white/10 sticky top-0 z-50">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-black text-blue-400">3D VOLT AI</h1>
          <button 
            onClick={() => {
              setVoiceEnabled(!voiceEnabled);
              if (!voiceEnabled) { // Unlock on toggle too
                const u = new SpeechSynthesisUtterance('');
                window.speechSynthesis.speak(u);
              }
            }}
            className={`px-4 py-2 rounded-full text-[10px] font-bold ${voiceEnabled ? 'bg-green-600' : 'bg-slate-700'}`}
          >
            {voiceEnabled ? '🔊 VOICE ON' : '🔇 VOICE OFF'}
          </button>
        </div>

        {/* RADAR RANGE SLIDER AT TOP */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
            <span>Radar Range</span>
            <span className="text-blue-400">{radius}m</span>
          </div>
          <input 
            type="range" min="100" max="5000" step="100" 
            value={radius} 
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none accent-blue-500"
          />
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Address Display */}
        <section className="bg-slate-900 p-4 rounded-2xl border border-white/5">
          <h2 className="text-[10px] text-blue-500 font-bold uppercase">Location</h2>
          <p className="text-lg font-bold leading-tight">
            {locationContext?.street || 'Scanning Street...'}
          </p>
          <p className="text-xs text-slate-400">{locationContext?.city || 'Detecting City...'}</p>
        </section>

        {/* AI Story Box (LARGE TEXT FOR PHONE) */}
        <section className={`p-6 rounded-3xl border-2 ${isNarrating ? 'border-blue-500 bg-blue-900/20' : 'border-white/10 bg-slate-900'}`}>
          <p className="text-xl font-medium leading-relaxed">
            {currentNarration || "Press Narrate to hear the history of this sector."}
          </p>
        </section>

        <button 
          onClick={handleNarrate}
          disabled={isNarrating}
          className="w-full py-6 bg-blue-600 rounded-3xl font-black text-lg shadow-xl active:scale-95 transition-all"
        >
          {isNarrating ? 'AI IS THINKING...' : 'NARRATE NOW'}
        </button>
      </main>

      {error && <div className="fixed bottom-0 w-full bg-red-600 p-2 text-center text-xs">{error}</div>}
    </div>
  );
}