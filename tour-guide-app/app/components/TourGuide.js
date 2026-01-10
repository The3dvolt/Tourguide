import React, { useState, useRef, useEffect } from 'react';

export default function TourGuide() {
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [narration, setNarration] = useState("");
  const [appVersion] = useState("v1.1.0"); // Change this to force cache refresh
  const audioRef = useRef(null);

  // 1. CACHE BUSTING LOGIC: Forces the browser to refresh if the version changes
  useEffect(() => {
    const savedVersion = localStorage.getItem('app_version');
    if (savedVersion !== appVersion) {
      localStorage.setItem('app_version', appVersion);
      // Hard reload the page once to clear old Safari cache
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }
  }, [appVersion]);

  // 2. AGGRESSIVE VOICE LOADING: Fixes the 'Empty List' bug in Safari
  const updateVoices = () => {
    const allVoices = window.speechSynthesis.getVoices();
    if (allVoices.length > 0) {
      const enVoices = allVoices.filter(v => v.lang.startsWith('en'));
      setVoices(enVoices);
      
      if (!selectedVoiceURI && enVoices.length > 0) {
        // Prefer natural voices like Samantha or Siri
        const best = enVoices.find(v => v.name.includes('Samantha') || v.name.includes('Siri')) || enVoices[0];
        setSelectedVoiceURI(best.voiceURI);
      }
    }
  };

  useEffect(() => {
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();
    // Safari polling: check every second until voices are found
    const timer = setInterval(() => {
      if (voices.length === 0) updateVoices();
    }, 1000);
    return () => clearInterval(timer);
  }, [voices.length]);

  // 3. VOICE UNLOCK: User gesture to release Safari's audio lock
  const unlockEngine = () => {
    const primer = new SpeechSynthesisUtterance("Audio enabled");
    primer.volume = 0.1; // Low volume just to trigger the speaker
    window.speechSynthesis.speak(primer);
    updateVoices();
    setIsUnlocked(true);
  };

  const previewVoice = () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("This is your tour guide's voice.");
    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  // 4. THE MAIN ACTION: Fetch location and ask Gemini to speak
  const startTour = async () => {
    setLoading(true);
    // Silent switch bypass: plays a silent loop so iPhone allows audio
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
        
        // Final Speech output
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(data.text);
        const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
        if (voice) utterance.voice = voice;
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error("Tour error:", err);
        setNarration("Sorry, I couldn't reach the historian.");
      } finally {
        setLoading(false);
      }
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 text-center font-sans">
      {/* Required for the Silent-Switch bypass */}
      <audio ref={audioRef} loop src="https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3" />
      
      <h1 className="text-3xl font-black text-blue-600 mb-2">3DVOLT GUIDE</h1>
      <p className="text-slate-400 text-xs uppercase tracking-widest mb-10">Version {appVersion}</p>

      {!isUnlocked || voices.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl shadow-2xl border-4 border-blue-100 max-w-sm animate-pulse">
          <p className="text-blue-900 font-bold mb-4 uppercase">iPhone Setup Required</p>
          <p className="text-slate-500 text-sm mb-6 font-medium">Safari requires a tap to load the voice engine and enable the speakers.</p>
          <button 
            onClick={unlockEngine}
            className="bg-blue-600 text-white px-10 py-5 rounded-full font-black shadow-lg active:scale-95 transition-all text-lg"
          >
            UNLOCK VOICES 🔓
          </button>
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-8 fade-in duration-500">
          {/* SETTINGS CARD */}
          <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
            <label className="block text-xs font-bold text-slate-400 mb-4 uppercase tracking-tighter text-left">Guide's Voice Selection</label>
            <select 
              value={selectedVoiceURI} 
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              className="w-full p-4 bg-slate-100 rounded-2xl mb-4 border-none text-slate-700 font-bold appearance-none text-sm"
            >
              {voices.map(v => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
              ))}
            </select>
            <button 
              onClick={previewVoice} 
              className="w-full py-2 text-blue-500 font-black text-xs uppercase border-2 border-blue-50 rounded-xl hover:bg-blue-50 transition-colors"
            >
              Preview Selected Voice 🔊
            </button>
          </div>

          {/* MAIN START BUTTON */}
          <button 
            onClick={startTour}
            disabled={loading}
            className={`w-48 h-48 rounded-full border-[12px] border-white shadow-2xl flex items-center justify-center flex-col text-white transition-all active:scale-90 relative ${loading ? 'bg-slate-300' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {loading ? (
              <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="text-5xl mb-2">📍</span>
                <span className="font-black text-xl tracking-tight">START TOUR</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* NARRATION BOX */}
      {narration && (
        <div className="mt-10 p-6 bg-white rounded-3xl shadow-2xl max-w-md border-t-8 border-blue-600 text-slate-700 leading-relaxed font-medium">
          <p className="italic">"{narration}"</p>
        </div>
      )}
    </div>
  );
}