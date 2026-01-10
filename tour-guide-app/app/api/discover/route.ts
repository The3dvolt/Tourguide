import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { lat, lon, radius = 5000 } = await req.json();

    // This query looks for Historic sites, Tourism attractions, 
    // AND general Buildings or Amenities if the others aren't found.
    const query = `
      [out:json][timeout:25];
      (
        node["historic"](around:${radius},${lat},${lon});
        way["historic"](around:${radius},${lat},${lon});
        node["tourism"](around:${radius},${lat},${lon});
        node["amenity"~"place_of_worship|museum|arts_centre|cafe"](around:${radius},${lat},${lon});
        node["building"~"church|cathedral|government|palace"](around:${radius},${lat},${lon});
      );
      out body center 15;
    `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': '3D-Volt-Tour-App/1.0' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) throw new Error('Overpass API not responding');
    
    const data = await response.json();
    
    // Map the results and ensure we have names
    const pois = data.elements?.map((el: any) => ({
      id: el.id,
      name: el.tags.name || el.tags.historic || el.tags.amenity || "Notable Structure",
      type: el.tags.historic || el.tags.tourism || "landmark"
    })) || [];

    // Get the address for street-level context
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
       headers: { 'User-Agent': '3D-Volt-Tour-App/1.0' }
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
    // Return a fallback so the app doesn't crash
    return NextResponse.json({ 
      pois: [], 
      locationContext: { street: "this area", city: "Local" } 
    });
  }
}