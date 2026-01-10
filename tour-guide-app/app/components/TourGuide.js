import React, { useState, useRef, useEffect } from 'react';

export default function TourGuide() {
  const [loading, setLoading] = useState(false);
  const [narration, setNarration] = useState("");
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const audioRef = useRef(null); // Hidden audio for the silent-switch trick

  // Load available voices on the device
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      // Filter for English voices that sound natural (Premium/Siri)
      const enVoices = availableVoices.filter(v => v.lang.startsWith('en'));
      setVoices(enVoices);
      // Default to a natural-sounding voice if possible
      const bestVoice = enVoices.find(v => v.name.includes('Samantha') || v.name.includes('Premium')) || enVoices[0];
      setSelectedVoice(bestVoice?.voiceURI);
    };

    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, []);

  const startTour = async () => {
    setLoading(true);

    // 1. THE SILENT SWITCH FIX: Play a hidden silent audio file
    // This 'primes' the iPhone to allow sound even if the silent switch is ON
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log("Silent audio blocked", e));
    }

    // 2. IPHONE UNLOCK: Prime the Speech engine
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
    window.speechSynthesis.cancel(); // Stop any current speaking
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Use the voice selected by the user
    const allVoices = window.speechSynthesis.getVoices();
    const voice = allVoices.find(v => v.voiceURI === selectedVoice);
    if (voice) utterance.voice = voice;

    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50 text-gray-900 font-sans">
      {/* Hidden Audio element to bypass Silent Switch */}
      <audio ref={audioRef} loop src="https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3" />

      <h1 className="text-3xl font-extrabold mb-2 text-blue-600">3DVolt Historian</h1>
      <p className="mb-8 text-gray-500">History narrated as you walk.</p>

      {/* Voice Selection Dropdown */}
      <div className="mb-6 w-full max-w-xs">
        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Select Your Guide</label>
        <select 
          value={selectedVoice} 
          onChange={(e) => setSelectedVoice(e.target.value)}
          className="w-full p-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500"
        >
          {voices.map(v => (
            <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
          ))}
        </select>
      </div>

      {!loading && (
        <button 
          onClick={startTour}
          className="bg-blue-600 hover:bg-blue-700 text-white w-48 h-48 rounded-full text-xl font-bold shadow-xl active:scale-95 transition-all flex flex-col items-center justify-center"
        >
          <span>TAP TO</span>
          <span>EXPLORE</span>
        </button>
      )}

      {loading && <div className="text-blue-500 animate-bounce text-xl font-bold">Checking local records...</div>}

      {narration && (
        <div className="mt-10 p-6 bg-white rounded-2xl shadow-lg border border-gray-100 max-w-md">
          <p className="text-lg leading-relaxed text-gray-700 italic">"{narration}"</p>
        </div>
      )}

      <p className="mt-8 text-xs text-gray-400">
        Tip: If you hear nothing, ensure volume is up and Silent Switch is off.
      </p>
    </div>
  );
}