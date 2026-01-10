import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { lat, lon, radius = 5000 } = await req.json();

    // 1. Try the main OpenStreetMap/Overpass API
    const query = `[out:json][timeout:10];node(around:${radius},${lat},${lon})["historic"];out 10;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const data = await response.json();
        if (data.elements && data.elements.length > 0) {
          return NextResponse.json({ 
            pois: data.elements.map((e: any) => ({ name: e.tags.name || "Historic Site", lat: e.lat, lon: e.lon })),
            locationContext: { street: "Historic District" }
          });
        }
      }
    } catch (e) {
      console.error("Overpass timeout, switching to fallback.");
    }

    // 2. FALLBACK: If Overpass fails, we provide a "Generic" point so the AI still works
    // This ensures your app NEVER shows 0 POIs
    return NextResponse.json({
      pois: [{ 
        id: 'fallback', 
        name: 'the local neighborhood and its hidden stories', 
        lat: lat + 0.001, 
        lon: lon + 0.001 
      }],
      locationContext: { street: "Current Location" }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}