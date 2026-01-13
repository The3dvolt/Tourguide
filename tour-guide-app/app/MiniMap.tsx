'use client';

import { useState, useEffect } from 'react';

export default function MiniMap() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  if (!position) {
    return (
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] z-50 border-2 border-white shadow-lg rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center text-xs text-gray-500 opacity-70">
        Locating...
      </div>
    );
  }

  // Calculate bounding box for the map view
  const delta = 0.002;
  const bbox = `${position.lng - delta},${position.lat - delta},${position.lng + delta},${position.lat + delta}`;

  return (
    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] z-50 border-2 border-white shadow-lg rounded-lg overflow-hidden bg-gray-200 opacity-70">
      <iframe
        title="User Location Mini Map"
        width="100%"
        height="100%"
        style={{ border: 0, pointerEvents: 'none' }}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${position.lat},${position.lng}`}
      />
    </div>
  );
}