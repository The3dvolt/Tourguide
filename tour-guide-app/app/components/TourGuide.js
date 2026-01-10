"use client";

import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase'; // Adjust path if necessary

export default function TourGuide({ radius, setRadius, pois, locationContext, debugInfo }) {
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [currentNarration, setCurrentNarration] = useState('');
  const audioRef = useRef(null);

  // Load voices for Safari
  const updateVoices = () => {
    const v = window.speechSynthesis.getVoices();
    if (v.length > 0) {
      const en = v.filter(voice => voice.lang.startsWith('en'));
      setVoices(en);
      if (!selectedVoiceURI && en.length > 0) {
        setSelectedVoiceURI(en[0].voiceURI);
      }
    }
  };

  useEffect(() => {
    window.speechSynthesis.onvoiceschanged = updateVoices;
    updateVoices();
  }, []);

  const handleStart = () => {
    const msg = new SpeechSynthesisUtterance("Audio active");
    msg.volume = 0;
    window.speechSynthesis.speak(msg);
    setIsUnlocked(true);
    updateVoices();
  };

  const handleNarrate = async () => {
    setIsNarrating(true);
    setCurrentNarration("Consulting archives...");
    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pois, locationContext })
      });
      const data = await res.json();
      setCurrentNarration(data.text);

      const utterance = new SpeechSynthesisUtterance(data.text);
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      setCurrentNarration("Error connecting to Gemini.");
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="space-y-6">
      {!isUnlocked ? (
        <button onClick={handleStart} className="w-full py-8 bg-blue-600 rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all">
          START TOUR 🔓
        </button>
      ) : (
        <>
          {/* Voice Dropdown */}
          <div className="bg-slate-900 p-4 rounded-3xl border border-white/10">
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Select Guide Voice</label>
            <select 
              value={selectedVoiceURI} 
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              className="w-full bg-black text-white p-3 rounded-xl border-none font-bold text-sm"
            >
              {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
            </select>
          </div>

          {/* Narration Box */}
          <section className={`p-6 rounded-[2.5rem] border-2 transition-all duration-700 ${isNarrating ? 'border-blue-500 bg-blue-500/5' : 'border-white/5 bg-slate-950'}`}>
            <p className="text-xl font-medium leading-relaxed text-slate-200">
              {currentNarration || "Ready to narrate your surroundings."}
            </p>
          </section>

          <button onClick={handleNarrate} disabled={isNarrating} className="w-full py-7 bg-blue-600 rounded-[2.5rem] font-black text-lg shadow-2xl active:scale-95">
            {isNarrating ? 'THINKING...' : 'NARRATE NOW'}
          </button>
        </>
      )}
    </div>
  );
}