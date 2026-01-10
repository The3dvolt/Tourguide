import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { lat, lon, radius } = await req.json();

    // 1. Get Address Context (Reverse Geocoding)
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`, {
      headers: { 'User-Agent': '3DVolt/1.0' }
    });
    const geo = await geoRes.json();
    const addr = geo.address || {};

    // 2. Get Markers (Overpass)
    const opQuery = `[out:json];(node(around:${radius},${lat},${lon})[tourism];node(around:${radius},${lat},${lon})[historic];);out tags center 10;`;
    const opRes = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: opQuery });
    const opData = await opRes.json();

    const pois = (opData.elements || []).map((el: any) => ({
      id: el.id,
      name: el.tags.name || "Historical Site",
      type: el.tags.tourism || el.tags.historic || 'marker',
      distance: 0 // Frontend calculates distance
    }));

    return NextResponse.json({ 
      pois, 
      locationContext: {
        street: addr.road || addr.suburb || "Local Street",
        city: addr.city || addr.town || "Gatineau",
        state: addr.state || "Quebec",
        fullAddress: geo.display_name
      }
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}