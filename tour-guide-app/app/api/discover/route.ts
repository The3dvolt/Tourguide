import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { lat, lon, radius = 5000 } = await req.json();

    // Simplified query to ensure it doesn't time out
    const query = `[out:json][timeout:15];(node(around:${radius},${lat},${lon})["historic"];node(around:${radius},${lat},${lon})["tourism"];node(around:${radius},${lat},${lon})["amenity"~"place_of_worship|museum|arts_centre"];);out body center 15;`;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': '3D-Volt-Tour-App' },
      body: `data=${encodeURIComponent(query)}`, // Sent as form data for better compatibility
    });

    const data = await response.json();
    
    // Map elements and ensure a fallback name exists
    const pois = data.elements?.map((el: any) => ({
      id: el.id,
      name: el.tags.name || el.tags.historic || el.tags.tourism || "Notable Landmark",
      type: el.tags.historic || "landmark",
      distance: 0
    })) || [];

    // Fallback Geocoding
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
       headers: { 'User-Agent': '3D-Volt-Tour-App' }
    });
    const geoData = await geoRes.json();

    return NextResponse.json({ 
      pois, 
      locationContext: {
        street: geoData.address?.road || "this area",
        city: geoData.address?.city || geoData.address?.town || "Local District"
      }
    });
  } catch (error: any) {
    console.error("Discover Error:", error);
    return NextResponse.json({ pois: [], locationContext: { street: "this area", city: "Local" } });
  }
}