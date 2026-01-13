import { useState, useEffect } from 'react';

export default function MiniMap() {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

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
  }, []);

  if (!position) {
    return (
      <div className="fixed top-4 right-4 w-[100px] h-[100px] z-50 border-2 border-white shadow-lg rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center text-xs text-gray-500">
        Locating...
      </div>
    );
  }

  // Calculate bounding box for the map view
  const delta = 0.002;
  const bbox = `${position.lng - delta},${position.lat - delta},${position.lng + delta},${position.lat + delta}`;

  return (
    <div className="fixed top-4 right-4 w-[100px] h-[100px] z-50 border-2 border-white shadow-lg rounded-lg overflow-hidden bg-gray-200">
      <iframe
        title="User Location Mini Map"
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        marginHeight="0"
        marginWidth="0"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${position.lat},${position.lng}`}
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}