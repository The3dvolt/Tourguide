import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { lat, lon, radius = 5000 } = await req.json();

    // 1. Try the main OpenStreetMap/Overpass API
    const query = `[out:json][timeout:10];node(around:${radius},${lat},${lon})["historic"];out 10;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000) // Don't wait more than 5 seconds
      });

      if (response.ok) {
        const data = await response.json();
        if (data.elements && data.elements.length > 0) {
          return NextResponse.json({ 
            pois: data.elements.map((e: any) => ({ 
              name: e.tags.name || "Historic Site", 
              lat: e.lat, 
              lon: e.lon 
            })),
            locationContext: { street: "Local Landmarks" }
          });
        }
      }
    } catch (e) {
      console.error("Overpass API Timeout - Using Fallback");
    }

    // 2. THE EMERGENCY FALLBACK (Prevents 'Obscured' error)
    // If the database is down, we create a 'Virtual' landmark at your location
    return NextResponse.json({
      pois: [{ 
        id: 'virtual-01', 
        name: 'the architectural history of this street', 
        lat: lat + 0.0001, 
        lon: lon + 0.0001 
      }],
      locationContext: { street: "Scanning Area..." }
    });

  } catch (error: any) {
    return NextResponse.json({ pois: [], error: error.message }, { status: 500 });
  }
}