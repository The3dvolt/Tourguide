import React, { useState, useRef, useEffect } from 'react';

export default function TourGuide() {
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [narration, setNarration] = useState("");
  const audioRef = useRef(null);

  // 1. Aggressive Voice Loader
  const updateVoices = () => {
    const allVoices = window.speechSynthesis.getVoices();
    if (allVoices.length > 0) {
      const enVoices = allVoices.filter(v => v.lang.startsWith('en'));
      setVoices(enVoices);
      
      // Default to a natural voice like 'Samantha' or 'Siri'
      if (!selectedVoiceURI) {
        const best = enVoices.find(v => v.name.includes('Samantha') || v.name.includes('Siri')) || enVoices[0];
        if (best) setSelectedVoiceURI(best.voiceURI);
      }
    }
  };

  useEffect(() => {
    // Listen for the browser's voice-ready event
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();

    // Check every second just in case Safari is being stubborn
    const timer = setInterval(() => {
      if (voices.length === 0) updateVoices();
    }, 1000);
    return () => clearInterval(timer);
  }, [voices.length]);

  // 2. THE KEY: The user must tap this to 'unfreeze' Safari voices
  const unlockEngine = () => {
    // Prime the speaker with a silent message
    const primer = new SpeechSynthesisUtterance("Audio enabled");
    primer.volume = 0; 
    window.speechSynthesis.speak(primer);
    
    // Force a voice list refresh
    updateVoices();
    setIsUnlocked(true);
  };

  const previewVoice = () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Testing my new voice.");
    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  const startTour = async () => {
    setLoading(true);
    if (audioRef.current) audioRef.current.play().catch(() => {});

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        const res = await fetch('/api/gemini-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: latitude, lng: longitude }),
        });
        const data = await res.json();
        setNarration(data.text);
        
        const utterance = new SpeechSynthesisUtterance(data.text);
        const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
        if (voice) utterance.voice = voice;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 text-center font-sans">
      <audio ref={audioRef} loop src="https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3" />
      
      <h1 className="text-3xl font-black text-blue-600 mb-8 uppercase tracking-tighter">3DVolt Explorer</h1>

      {/* STEP 1: FORCE UNLOCK (Shows if not unlocked or voices are empty) */}
      {!isUnlocked || voices.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl shadow-2xl border-4 border-blue-100 max-w-sm">
          <p className="text-blue-900 font-bold mb-4">iPhone Security Check</p>
          <p className="text-slate-500 text-sm mb-6">Safari requires a tap to load voice settings and enable audio.</p>
          <button 
            onClick={unlockEngine}
            className="bg-blue-600 text-white px-10 py-4 rounded-full font-black shadow-lg active:scale-95 transition-all"
          >
            ENABLE AUDIO & VOICES 🔓
          </button>
        </div>
      ) : (
        /* STEP 2: SETTINGS & START (Shows once unlocked) */
        <div className="w-full max-w-sm animate-in fade-in zoom-in duration-300">
          <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 mb-8">
            <label className="block text-xs font-bold text-slate-400 mb-3 uppercase tracking-widest">Select Your Guide</label>
            <select 
              value={selectedVoiceURI} 
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              className="w-full p-4 bg-slate-100 rounded-2xl mb-4 border-none text-slate-700 font-bold"
            >
              {voices.map(v => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
              ))}
            </select>
            <button onClick={previewVoice} className="text-blue-500 font-black text-xs uppercase tracking-wider">
              Test Voice 🔊
            </button>
          </div>

          <button 
            onClick={startTour}
            disabled={loading}
            className={`w-44 h-44 rounded-full border-[10px] border-white shadow-2xl flex items-center justify-center flex-col text-white transition-all active:scale-90 ${loading ? 'bg-slate-300' : 'bg-blue-600'}`}
          >
            <span className="text-4xl mb-1">📍</span>
            <span className="font-black text-xl">START</span>
          </button>
        </div>
      )}

      {narration && (
        <div className="mt-8 p-6 bg-white rounded-3xl shadow-2xl max-w-md border-l-8 border-blue-600 italic text-slate-700">
          "{narration}"
        </div>
      )}
    </div>
  );
}