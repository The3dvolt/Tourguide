import React, { useState, useRef, useEffect } from 'react';

export default function TourGuide() {
  const [loading, setLoading] = useState(false);
  const [narration, setNarration] = useState("");
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const audioRef = useRef(null);

  // 1. Voice Loading Strategy for Safari
  const loadVoices = () => {
    const allVoices = window.speechSynthesis.getVoices();
    if (allVoices.length > 0) {
      // Filter for English or your preferred language
      const filtered = allVoices.filter(v => v.lang.startsWith('en'));
      setVoices(filtered);
      
      // Default to a high-quality Siri/Samantha voice if possible
      if (!selectedVoiceURI) {
        const best = filtered.find(v => v.name.includes('Samantha') || v.name.includes('Premium')) || filtered[0];
        if (best) setSelectedVoiceURI(best.voiceURI);
      }
    }
  };

  useEffect(() => {
    // Some browsers trigger this event when voices are ready
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    
    // Safety interval for Safari mobile
    const interval = setInterval(() => {
      if (voices.length === 0) loadVoices();
      else clearInterval(interval);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [voices.length]);

  // 2. The Unlock & Preview Function
  const handlePreview = () => {
    // Safari needs this "primer" to unlock the voice engine
    const primer = new SpeechSynthesisUtterance("Voice preview active.");
    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) primer.voice = voice;
    
    window.speechSynthesis.cancel(); // Stop any previous speech
    window.speechSynthesis.speak(primer);
    setIsUnlocked(true);
  };

  const startTour = async () => {
    setLoading(true);
    
    // Silent switch bypass
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }

    // Trigger dummy speech to ensure Safari allows subsequent auto-speech
    const primer = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(primer);

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        const response = await fetch('/api/gemini-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: latitude, lng: longitude }),
        });
        const data = await response.json();
        setNarration(data.text);
        speak(data.text);
      } catch (err) {
        console.error("Tour failed", err);
      } finally {
        setLoading(false);
      }
    });
  };

  const speak = (text) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 font-sans">
      <audio ref={audioRef} loop src="https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3" />

      <h1 className="text-3xl font-black text-blue-700 mb-2">3DVolt Guide</h1>
      <p className="text-slate-500 mb-8 text-sm uppercase tracking-widest">Historical Navigator</p>

      {/* VOICE SELECTION BOX */}
      <div className="w-full max-w-sm bg-white p-6 rounded-3xl shadow-xl mb-8 border border-slate-100">
        <label className="block text-xs font-bold text-slate-400 mb-3 uppercase">Choose Your Guide's Voice</label>
        
        <select 
          value={selectedVoiceURI} 
          onChange={(e) => setSelectedVoiceURI(e.target.value)}
          className="w-full p-4 bg-slate-100 rounded-2xl mb-4 border-none text-slate-700 font-medium appearance-none"
        >
          {voices.length === 0 ? (
            <option>Loading voices... (Tap Preview to start)</option>
          ) : (
            voices.map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
            ))
          )}
        </select>

        <button 
          onClick={handlePreview}
          className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold active:scale-95 transition-all text-sm"
        >
          {isUnlocked ? "TEST SELECTED VOICE 🔊" : "UNLOCK & PREVIEW VOICES 🔓"}
        </button>
      </div>

      {!loading ? (
        <button 
          onClick={startTour}
          className="w-44 h-44 bg-blue-600 rounded-full shadow-2xl shadow-blue-200 border-8 border-white flex items-center justify-center flex-col text-white group active:scale-90 transition-all"
        >
          <span className="text-4xl mb-1">📍</span>
          <span className="font-bold text-lg">START TOUR</span>
        </button>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="font-bold text-blue-600">Consulting History...</p>
        </div>
      )}

      {narration && (
        <div className="mt-8 p-6 bg-blue-600 text-white rounded-3xl shadow-2xl max-w-md animate-in fade-in slide-in-from-bottom-4">
          <p className="text-lg leading-relaxed font-medium italic">"{narration}"</p>
        </div>
      )}
    </div>
  );
}