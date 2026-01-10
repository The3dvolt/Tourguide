'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';

// Helper: Calculate bearing between user and landmark
function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin((lon2 - lon1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
  const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
            Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lon2 - lon1) * (Math.PI / 180));
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

export default function TourGuidePage() {
  // --- States ---
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [heading, setHeading] = useState(0); 
  const [pois, setPois] = useState<any[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [autoLoopActive, setAutoLoopActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isMuted, setIsMuted] = useState(false);
  
  // --- Voice States ---
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  
  // --- Refs ---
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [arrowRotation, setArrowRotation] = useState(0);

  // --- 1. Audio Engine & Voice Setup ---
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      const englishVoices = v.filter(voice => voice.lang.startsWith('en'));
      setVoices(englishVoices);
      if (englishVoices.length > 0 && !selectedVoiceURI) {
        setSelectedVoiceURI(englishVoices[0].voiceURI);
      }
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, [selectedVoiceURI]);

  const playVoice = (text: string) => {
    if (isMuted) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const previewVoice = () => playVoice("System voice check. Audio engine is now active.");

  // --- 2. Orientation & Compass ---
  useEffect(() => {
    const handleOrientation = (e: any) => {
      // Use webkitCompassHeading for iOS, alpha for Android
      const compass = e.webkitCompassHeading || (360 - e.alpha);
      if (compass) setHeading(compass);
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  // --- 3. GPS & Arrow Logic ---
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lon: longitude });

        if (pois.length > 0) {
          const target = pois[0]; // Arrow points to first POI in list
          const tLat = target.lat || target.center?.lat;
          const tLon = target.lon || target.center?.lon;
          
          if (tLat && tLon) {
            const bearing = getBearing(latitude, longitude, tLat, tLon);
            setArrowRotation(bearing - heading);
          }
        }
      }, null, { enableHighAccuracy: true });
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [pois, heading]);

  // --- 4. Narration Logic ---
  const handleNarrate = async (isAutoCall = false) => {
    if (isNarrating && !isAutoCall) return;
    setIsNarrating(true);
    
    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pois, locationContext, model: "gemini-2.5-flash" })
      });

      const data = await res.json();
      const parts = data.text.split(/LINK:/i);
      const storyText = parts[0].replace(/STORY:/i, '').trim();
      const linkText = parts[1]?.trim() || '';

      setCurrentNarration(storyText);
      setExternalLink(linkText);
      playVoice(storyText);

    } catch (e) {
      console.error(e);
    } finally {
      setIsNarrating(false);
    }
  };

  // --- 5. Timer & Loop ---
  const toggleAutoTour = async () => {
    // Request iOS orientation permission if needed
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      await (DeviceOrientationEvent as any).requestPermission();
    }

    const newState = !autoLoopActive;
    setAutoLoopActive(newState);
    
    if (newState) {
      handleNarrate(true);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setTimeLeft(30);
      countdownIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleNarrate(true);
            return 30;
          }
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
    <div className="flex flex-col min-h-screen bg-black text-white p-4 max-w-lg mx-auto overflow-hidden font-sans">
      <header className="flex justify-between items-center mb-4">
        <h1 className="font-black text-blue-500 text-xl italic tracking-tighter">3D VOLT TOUR</h1>
        <button 
          onClick={() => setIsMuted(!isMuted)} 
          className={`px-4 py-2 rounded-full text-[9px] font-black border uppercase transition-colors ${isMuted ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-green-500 text-green-500 bg-green-500/10'}`}
        >
          {isMuted ? '🔇 Muted' : '🔊 Audio On'}
        </button>
      </header>

      <main className="space-y-4">
        {/* Navigation Arrow */}
        <div className="flex flex-col items-center justify-center py-2">
          <div 
            className="w-20 h-20 border-2 border-blue-500/30 rounded-full flex items-center justify-center transition-transform duration-200"
            style={{ transform: `rotate(${arrowRotation}deg)` }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"></line>
              <polyline points="5 12 12 5 19 12"></polyline>
            </svg>
          </div>
          <p className="text-[8px] font-black text-blue-500 uppercase mt-2 tracking-[0.2em]">Target Direction</p>
        </div>

        {/* Story Display */}
        <div className={`p-6 rounded-[2.5rem] border-2 min-h-[200px] relative flex flex-col justify-center transition-all duration-700 ${autoLoopActive ? 'border-blue-500 bg-blue-500/5' : 'border-white/5 bg-slate-950'}`}>
          {autoLoopActive && (
            <div className="absolute top-6 right-8 text-right">
              <span className="text-[8px] font-black text-blue-500 uppercase block mb-1">Syncing</span>
              <span className="text-2xl font-mono font-black tabular-nums">{timeLeft}s</span>
            </div>
          )}
          
          <p className="text-slate-200 text-lg font-medium italic text-center leading-snug">
            {currentNarration || "Calibrating archives for your location..."}
          </p>
          
          {externalLink && (
            <a href={externalLink} target="_blank" className="mt-6 mx-auto bg-blue-600/20 text-blue-400 px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-400/30">
              Explore History ↗
            </a>
          )}
        </div>

        {/* Narrator Settings */}
        <section className="bg-slate-900 p-4 rounded-3xl border border-white/5 space-y-4">
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Select Historian</label>
            <div className="flex gap-2">
              <select 
                value={selectedVoiceURI} 
                onChange={(e) => setSelectedVoiceURI(e.target.value)}
                className="flex-1 bg-black border border-white/10 p-3 rounded-xl text-xs font-bold text-slate-300"
              >
                {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
              </select>
              <button onClick={previewVoice} className="bg-blue-600/10 text-blue-500 px-4 rounded-xl border border-blue-600/20 text-[10px] font-black uppercase">
                Test
              </button>
            </div>
          </div>
        </section>

        <button 
          onClick={toggleAutoTour} 
          className={`w-full py-6 rounded-full font-black text-xl uppercase tracking-tighter transition-all ${autoLoopActive ? 'bg-red-600' : 'bg-blue-600 shadow-xl shadow-blue-900/40'}`}
        >
          {autoLoopActive ? 'Stop Tour' : 'Start Auto-Tour'}
        </button>
      </main>
    </div>
  );
}