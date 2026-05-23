const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Geocodes an address to latitude and longitude using Google Maps Geocoding API.
 * @param {string} address The place name or address.
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
export async function geocodeAddress(address) {
  if (!address) return null;
  
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.status === "OK" && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      const formattedAddress = data.results[0].formatted_address;
      return {
        lat: location.lat,
        lng: location.lng,
        address: formattedAddress || null
      };
    }
    
    console.warn(`[Geocoder] No results for address: "${address}". Status: ${data.status}`);
    return null;
  } catch (error) {
    console.error("[Geocoder] Error geocoding address:", error);
    return null;
  }
}
