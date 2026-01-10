import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { lat, lon, radius } = await req.json();

    // 1. Get the Address (Reverse Geocoding)
    const geoResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { 'User-Agent': 'TourGuideApp/1.0' } }
    );
    const geoData = await geoResponse.json();
    const address = geoData.address || {};

    // 2. Broaden search for ANY physical features (streets, shops, parks)
    const overpassQuery = `
      [out:json];
      (
        node(around:${radius},${lat},${lon});
        way(around:${radius},${lat},${lon});
      );
      out tags center 15;
    `;
    
    const osmResponse = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery
    });
    const osmData = await osmResponse.json();

    const pois = osmData.elements
      .filter((el: any) => el.tags && el.tags.name)
      .map((el: any) => ({
        id: el.id.toString(),
        name: el.tags.name,
        type: el.tags.amenity || el.tags.shop || el.tags.highway || 'location'
      }));

    return NextResponse.json({ 
      pois, 
      locationContext: {
        street: address.road || address.suburb || "this street",
        city: address.city || address.town || "this city",
        state: address.state || "this province",
        country: address.country || "this country",
        fullAddress: geoData.display_name
      } 
    });

  } catch (error) {
    console.error("Discovery error:", error);
    return NextResponse.json({ error: "Context discovery failed" }, { status: 500 });
  }
}