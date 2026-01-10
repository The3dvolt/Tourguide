'use client';

import { useState, useEffect, useRef } from 'react';

interface POI {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  description: string;
  distance: number;
  bearing: number;
}

export default function TourGuidePage() {
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [heading, setHeading] = useState(0);
  const [pois, setPois] = useState<POI[]>([]);
  const [isNarrating, setIsNarrating] = useState(false);
  const [currentNarration, setCurrentNarration] = useState('');
  const [interests, setInterests] = useState(['history', 'architecture', 'food']);
  const [radius, setRadius] = useState(500);
  const [autoMode, setAutoMode] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [cityInfo, setCityInfo] = useState<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastNarrationTime = useRef(0);
  
  // Request location permission
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by your browser');
      return;
    }
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
        setError('');
        setDebugInfo(`Location updated: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
      },
      (err) => {
        setError(`Location error: ${err.message}`);
        setDebugInfo(`Error code: ${err.code}`);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
    
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  
  // Track device heading
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) {
        setHeading(event.alpha);
      }
    };
    
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((state: string) => {
          if (state === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        });
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }
    
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);
  
  // Discover nearby POIs
  useEffect(() => {
    if (!location) return;
    
    const discoverPOIs = async () => {
      try {
        setDebugInfo(`Searching for POIs within ${radius}m...`);
        const response = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: location.lat,
            lon: location.lon,
            radius,
            interests
          })
        });
        
        const data = await response.json();
        setPois(data.pois || []);
        setCityInfo(data.cityInfo || null);
        
        if (data.pois && data.pois.length > 0) {
          setDebugInfo(`Found ${data.pois.length} POIs`);
        } else if (data.cityInfo) {
          setDebugInfo(`No nearby POIs, found info about ${data.cityInfo.name}`);
        } else {
          setDebugInfo('No POIs found, try increasing radius');
        }
        
        if (data.error) {
          setError(data.error);
        }
      } catch (err) {
        setError('Failed to discover POIs: ' + String(err));
        setDebugInfo('Discovery error');
      }
    };
    
    discoverPOIs();
    const interval = setInterval(discoverPOIs, 30000);
    
    return () => clearInterval(interval);
  }, [location, radius, interests]);
  
  // Auto-narration mode logic
  useEffect(() => {
    if (!autoMode || isNarrating) return;
    if (pois.length === 0 && !cityInfo) return;
    
    const now = Date.now();
    const timeSinceLastNarration = now - lastNarrationTime.current;
    
    if (timeSinceLastNarration > 15000) {
      narrate();
    }
    
    const interval = setInterval(() => {
      if (!isNarrating && (pois.length > 0 || cityInfo)) {
        narrate();
      }
    }, 15000);
    
    return () => clearInterval(interval);
  }, [autoMode, isNarrating, pois, cityInfo]);
  
  // Generate and play narration - FIXED AND COMPLETED
  const narrate = async () => {
    if (isNarrating) return;
    if (pois.length === 0 && !cityInfo) return;
    
    setIsNarrating(true);
    setCurrentNarration('🔍 Generating narration...');
    lastNarrationTime.current = Date.now();
    
    try {
      const narrationResponse = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pois,
          location,
          heading,
          cityInfo,
          interests
        }),
      });
      
      const data = await narrationResponse.json();
      
      if (data.text) {
        setCurrentNarration(data.text);
        
        // If the API returns audio content (base64 or URL), play it
        if (data.audioContent && audioRef.current) {
          audioRef.current.src = `data:audio/mp3;base64,${data.audioContent}`;
          audioRef.current.play();
        }
      }
    } catch (err) {
      console.error('Narration error:', err);
      setCurrentNarration('Error generating narration.');
    } finally {
      setIsNarrating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-white p-4 font-sans">
      <header className="py-4 border-b border-slate-700 mb-6">
        <h1 className="text-2xl font-bold text-blue-400">AI Tour Guide</h1>
        <p className="text-xs text-slate-400">{debugInfo}</p>
        {error && <p className="text-red-400 text-xs mt-1">⚠️ {error}</p>}
      </header>

      <main className="flex-1 space-y-6 max-w-2xl mx-auto w-full">
        {/* Current Status Card */}
        <section className="bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold">Current Location</h2>
              <p className="text-sm text-slate-400">
                {location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : 'Detecting...'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 block">Heading</span>
              <span className="text-xl font-mono">{Math.round(heading)}°</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => setAutoMode(!autoMode)}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                autoMode ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-700 hover:bg-slate-600'
              }`}
            >
              {autoMode ? 'Auto Mode: ON' : 'Auto Mode: OFF'}
            </button>
            <button 
              onClick={narrate}
              disabled={isNarrating || (pois.length === 0 && !cityInfo)}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 transition"
            >
              {isNarrating ? 'Generating...' : 'Narrate Now'}
            </button>
          </div>
        </section>

        {/* Narration Display */}
        {currentNarration && (
          <section className="bg-blue-900/30 p-4 rounded-xl border border-blue-500/50 animate-pulse-once">
            <h3 className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">Narration</h3>
            <p className="text-lg leading-relaxed">{currentNarration}</p>
          </section>
        )}

        {/* Nearby POIs List */}
        <section>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
            Nearby Places ({pois.length})
          </h3>
          <div className="space-y-3">
            {pois.length > 0 ? (
              pois.map((poi) => (
                <div key={poi.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-center">
                  <div>
                    <h4 className="font-medium">{poi.name}</h4>
                    <p className="text-xs text-slate-400 capitalize">{poi.type} • {Math.round(poi.distance)}m away</p>
                  </div>
                  <div className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-1 rounded">
                    {Math.round(poi.bearing)}°
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-center py-4">No points of interest found nearby.</p>
            )}
          </div>
        </section>

        {/* Hidden Audio Element */}
        <audio ref={audioRef} onEnded={() => setIsNarrating(false)} className="hidden" />
      </main>

      <footer className="mt-8 pt-4 border-t border-slate-800">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-400">Search Radius: {radius}m</label>
            <input 
              type="range" min="100" max="2000" step="100" 
              value={radius} 
              onChange={(e) => setRadius(parseInt(e.target.value))}
              className="w-1/2"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}