"use client";

import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase'; // Adjust path if necessary
import TTSManager from '../lib/TTSManager';

export default function TourGuide({ radius, setRadius, pois, locationContext, debugInfo }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [currentNarration, setCurrentNarration] = useState('');
  const audioRef = useRef(null);
  const ttsManager = TTSManager.getInstance();

  const handleStart = () => {
    ttsManager.speak("Audio active");
    setIsUnlocked(true);
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
      ttsManager.speak(data.text);
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