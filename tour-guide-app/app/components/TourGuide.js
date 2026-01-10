import React, { useState, useRef } from 'react';

export default function TourGuide() {
  const [loading, setLoading] = useState(false);
  const [narration, setNarration] = useState("");

  const startTour = async () => {
    setLoading(true);
    
    // 1. IPHONE UNLOCK: We create a dummy utterance to 'prime' the speakers
    const primer = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(primer);

    // 2. Get Location
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;

      try {
        const response = await fetch('/api/gemini-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: latitude, lng: longitude }),
        });

        // Handle the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              fullText += data.text;
              setNarration(fullText);
            }
          }
        }

        // 3. SPEAK: Now that the stream is done, play the full narration
        speak(fullText);

      } catch (err) {
        console.error("Tour failed", err);
      } finally {
        setLoading(false);
      }
    });
  };

  const speak = (text) => {
    // We use the most natural voice available on the device
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    // Try to find a premium/natural voice (often named 'Samantha' on iPhone)
    utterance.voice = voices.find(v => v.name.includes('Samantha')) || voices[0];
    utterance.rate = 0.9; // Slightly slower feels more natural
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">3DVolt Historian</h1>
      
      {!narration && !loading && (
        <button 
          onClick={startTour}
          className="bg-blue-600 text-white px-8 py-4 rounded-full text-xl shadow-lg active:scale-95 transition-transform"
        >
          Start Historical Tour 🏛️
        </button>
      )}

      {loading && <p className="animate-pulse">Consulting the archives...</p>}

      {narration && (
        <div className="bg-white p-6 rounded-lg shadow-md max-w-md">
          <p className="text-lg italic">"{narration}"</p>
          <button 
            onClick={startTour} 
            className="mt-4 text-blue-500 underline"
          >
            Tell me more about this spot
          </button>
        </div>
      )}
    </div>
  );
}