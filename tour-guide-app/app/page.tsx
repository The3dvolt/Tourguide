'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';

// ... (POI interface stays the same)
interface POI { id: string; name: string; type: string; distance: number; }

export default function TourGuidePage() {
  const [user, setUser] = useState<any>(null);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [locationContext, setLocationContext] = useState<any>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [isNarrating, setIsNarrating] = useState(false);
  const [radius, setRadius] = useState(2000);
  const [debugInfo, setDebugInfo] = useState('Syncing GPS...');
  const [apiStatus, setApiStatus] = useState<'idle' | 'calling' | 'success' | 'error'>('idle');
  const [lastApiError, setLastApiError] = useState('');
  const [appVersion] = useState("v1.5.0-debug"); 

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastFetchedLocation = useRef<{lat: number, lon: number} | null>(null);

  // --- Voice & Auth Logic (Same as before) ---
  useEffect(() => {
    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        const en = v.filter(v => v.lang.startsWith('en'));
        setVoices(en);
        if (!selectedVoiceURI && en.length > 0) setSelectedVoiceURI(en[0].voiceURI);
      }
    };
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();
  }, [selectedVoiceURI]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  // --- GPS Tracking ---
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    }, (err) => setDebugInfo(`GPS Error: ${err.message}`), { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!location) return;
    fetch('/api/discover', {
      method: 'POST',
      body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
    })
    .then(res => res.json())
    .then(data => {
      setPois(data.pois || []);
      setLocationContext(data.locationContext || null);
    });
  }, [location, radius]);

  // --- IMPROVED NARRATE WITH DEBUG ---
  const handleNarrate = async () => {
    if (isNarrating) return;
    setIsNarrating(true);
    setApiStatus('calling');
    setLastApiError('');
    setCurrentNarration('Querying Gemini Historian...');

    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pois, locationContext })
      });
      
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.text || `HTTP ${res.status}`);
      }

      setApiStatus('success');
      setCurrentNarration(data.text);
      
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.text);
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);

    } catch (e: any) {
      setApiStatus('error');
      setLastApiError(e.message);
      setCurrentNarration("Archive connection failed.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-sans p-4">
      <header className="mb-6">
        <h1 className="font-black text-blue-500 text-2xl italic tracking-tighter">3D VOLT DEBUG</h1>
        <p className="text-[10px] text-slate-500 font-mono">{appVersion} | GPS: {location ? 'OK' : 'WAIT'}</p>
      </header>

      {!isUnlocked ? (
        <button onClick={() => setIsUnlocked(true)} className="w-full py-10 bg-blue-600 rounded-3xl font-black">UNLOCK APP</button>
      ) : (
        <div className="space-y-4">
          {/* LIVE API HINTS WINDOW */}
          <div className="bg-slate-900 border border-white/10 p-4 rounded-2xl font-mono text-[10px]">
            <p className="text-blue-400 mb-1 uppercase font-black">System Status:</p>
            <div className="grid grid-cols-2 gap-2">
              <p>GPS: <span className={location ? 'text-green-500' : 'text-red-500'}>{location ? 'ACTIVE' : 'OFF'}</span></p>
              <p>POIS: <span className={pois.length > 0 ? 'text-green-500' : 'text-yellow-500'}>{pois.length}</span></p>
              <p>API: <span className={apiStatus === 'error' ? 'text-red-500' : 'text-green-500'}>{apiStatus.toUpperCase()}</span></p>
              <p>CONTEXT: <span className={locationContext ? 'text-green-500' : 'text-red-500'}>{locationContext ? 'OK' : 'MISSING'}</span></p>
            </div>
            {lastApiError && (
              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/50 text-red-400 break-all">
                ERR: {lastApiError}
              </div>
            )}
          </div>

          <section className="p-6 rounded-3xl bg-slate-950 border border-white/10">
            <p className="text-lg text-slate-200">{currentNarration}</p>
          </section>

          <button onClick={handleNarrate} disabled={isNarrating} className="w-full py-6 bg-blue-600 rounded-full font-black text-lg">
            {isNarrating ? 'SYNCING...' : 'NARRATE'}
          </button>
        </div>
      )}
    </div>
  );
}