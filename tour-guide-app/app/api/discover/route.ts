import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { lat, lon, radius } = await req.json();

    if (!lat || !lon) {
      return NextResponse.json({ error: "Missing coordinates" }, { status: 400 });
    }

    // 1. Get Address Hierarchy (Street -> City -> Province -> Country)
    // We use Nominatim (OpenStreetMap) for this. 
    // It is free but requires a User-Agent header.
    const geoResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': '3DVoltTourGuide/1.0 (contact@3dvolt.com)',
        },
      }
    );
    const geoData = await geoResponse.json();
    const address = geoData.address || {};

    // 2. Search for Landmarks (Points of Interest)
    // We search for tourism, historic sites, and significant amenities.
    const overpassQuery = `
      [out:json][timeout:25];
      (
        node["tourism"](around:${radius},${lat},${lon});
        node["historic"](around:${radius},${lat},${lon});
        node["amenity"~"museum|gallery|theatre|place_of_worship"](around:${radius},${lat},${lon});
        way["tourism"](around:${radius},${lat},${lon});
        way["historic"](around:${radius},${lat},${lon});
      );
      out body center 20;
    `;

    const osmResponse = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery,
    });

    let pois = [];
    if (osmResponse.ok) {
      const osmData = await osmResponse.json();
      pois = (osmData.elements || [])
        .filter((el: any) => el.tags && (el.tags.name))
        .map((el: any) => {
          // Overpass returns 'center' for ways and 'lat/lon' for nodes
          const poiLat = el.lat || (el.center && el.center.lat);
          const poiLon = el.lon || (el.center && el.center.lon);
          
          return {
            id: el.id.toString(),
            name: el.tags.name,
            type: el.tags.tourism || el.tags.historic || el.tags.amenity || 'point of interest',
            lat: poiLat,
            lon: poiLon,
            // Distance is calculated roughly here, but frontend can refine it
            distance: calculateDistance(lat, lon, poiLat, poiLon)
          };
        })
        .sort((a: any, b: any) => a.distance - b.distance);
    }

    // 3. Return the Combined Data
    return NextResponse.json({
      pois,
      locationContext: {
        street: address.road || address.pedestrian || address.suburb || "this historic path",
        city: address.city || address.town || address.village || address.municipality || "Gatineau",
        state: address.state || address.province || "Quebec",
        country: address.country || "Canada",
        fullAddress: geoData.display_name || "your current location"
      }
    });

  } catch (error) {
    console.error("Discovery Error:", error);
    return NextResponse.json({ error: "Failed to discover location context" }, { status: 500 });
  }
}

// Helper function to calculate distance in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; 
}