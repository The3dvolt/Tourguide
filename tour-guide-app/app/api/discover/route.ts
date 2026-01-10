import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { lat, lon, radius = 5000 } = await req.json();

    // Ultra-reliable Overpass query
    const query = `[out:json];node(around:${radius},${lat},${lon})["historic"];out 20;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': '3DVoltTour/1.0' }
    });

    const data = await response.json();
    
    // Map anything found, or provide a default if empty
    const pois = data.elements?.map((el: any) => ({
      id: el.id,
      name: el.tags.name || "Historical Marker",
      type: el.tags.historic || "landmark"
    })) || [];

    // Reverse Geocode for the street name
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
      headers: { 'User-Agent': '3DVoltTour/1.0' }
    });
    const geoData = await geoRes.json();

    return NextResponse.json({ 
      pois, 
      locationContext: {
        street: geoData.address?.road || "this neighborhood",
        city: geoData.address?.city || geoData.address?.town || "Local Area"
      }
    });
  } catch (error) {
    return NextResponse.json({ pois: [], locationContext: { street: "this area", city: "Local" } });
  }
}