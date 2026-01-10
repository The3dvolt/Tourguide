import React, { useState, useRef, useEffect } from 'react';

export default function TourGuide() {
  const [loading, setLoading] = useState(false);
  const [narration, setNarration] = useState("");
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const audioRef = useRef(null);

  // Aggressive Voice Loading for Safari
  const loadVoices = () => {
    const allVoices = window.speechSynthesis.getVoices();
    console.log("Detected voices:", allVoices.length);
    
    if (allVoices.length > 0) {
      const enVoices = allVoices.filter(v => v.lang.startsWith('en'));
      setVoices(enVoices);
      
      if (!selectedVoiceURI) {
        const best = enVoices.find(v => v.name.includes('Samantha') || v.name.includes('Siri')) || enVoices[0];
        if (best) setSelectedVoiceURI(best.voiceURI);
      }
    }
  };

  useEffect(() => {
    // Attempt to load voices immediately and on change
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();

    // Safari Hack: Keep polling until voices appear
    const timer = setInterval(() => {
      if (voices.length === 0) loadVoices();
      else clearInterval(timer);
    }, 500);

    return () => clearInterval(timer);
  }, [voices.length]);

  // THIS BUTTON UNLOCKS THE ENGINE
  const forceUnlockVoices = () => {
    // 1. Prime the speakers with silence
    const primer = new SpeechSynthesisUtterance("Audio active");
    primer.volume = 0; // Silent but counts as a user gesture
    window.speechSynthesis.speak(primer);
    
    // 2. Re-trigger voice loading
    loadVoices();
    setIsUnlocked(true);
  };

  const speakPreview = () => {
    const utterance = new SpeechSynthesisUtterance("Testing this voice choice.");
    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const startTour = async () => {
    setLoading(true);
    // Silent switch bypass
    if (audioRef.current) audioRef.current.play().catch(() => {});

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
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50 text-center">
      <audio ref={audioRef} loop src="https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3" />
      
      <h1 className="text-3xl font-bold text-blue-600 mb-6">3DVolt Tour</h1>

      {/* STEP 1: UNLOCK BUTTON (Only shows if engine is locked) */}
      {!isUnlocked && (
        <div className="mb-8 p-6 bg-yellow-100 rounded-2xl border-2 border-yellow-200">
          <p className="text-sm text-yellow-700 mb-4 font-bold">iPhone detected: Audio needs to be enabled manually.</p>
          <button 
            onClick={forceUnlockVoices}
            className="bg-yellow-500 text-white px-6 py-3 rounded-full font-bold shadow-lg"
          >
            STEP 1: ENABLE VOICE 🔓
          </button>
        </div>
      )}

      {/* STEP 2: VOICE SELECTION */}
      {isUnlocked && (
        <div className="w-full max-w-xs mb-8">
          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Select Your Guide</label>
          <select 
            value={selectedVoiceURI} 
            onChange={(e) => setSelectedVoiceURI(e.target.value)}
            className="w-full p-4 rounded-xl bg-white shadow-md border-none mb-4"
          >
            {voices.map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
            ))}
          </select>
          <button onClick={speakPreview} className="text-blue-500 font-bold text-sm underline">
            Preview Selected Voice
          </button>
        </div>
      )}

      {/* STEP 3: START TOUR */}
      {isUnlocked && (
        <button 
          onClick={startTour}
          className={`w-40 h-40 rounded-full border-8 border-white shadow-2xl text-white font-bold text-xl transition-all ${loading ? 'bg-gray-400' : 'bg-blue-600 active:scale-90'}`}
          disabled={loading}
        >
          {loading ? '...' : 'START'}
        </button>
      )}

      {narration && (
        <div className="mt-8 p-6 bg-white rounded-2xl shadow-xl max-w-sm italic">
          "{narration}"
        </div>
      )}
    </div>
  );
}