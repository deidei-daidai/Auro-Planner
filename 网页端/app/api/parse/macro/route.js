import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/maps";

export async function POST(req) {
  try {
    const { text } = await req.json();
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Input text is required" }, { status: 400 });
    }

    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: "DeepSeek API Key is not configured" }, { status: 500 });
    }

    // Call DeepSeek to parse the macro plan
    const systemPrompt = `You are a professional travel planner AI. Parse the unstructured travel text into a high-level overall travel schedule.
You must return a valid JSON object matching the schema below. Do not include any markdown format blocks in your response, just return pure JSON.

JSON Schema:
{
  "name": "Trip Name (e.g. 意大利10日经典之旅)",
  "totalDays": 10,
  "summary": "Short overall description of the trip and routing",
  "cities": [
    {
      "name": "City/Region Chinese Name (e.g. 罗马)",
      "englishName": "City/Region Official English or Local Name (e.g. Rome)",
      "dayStart": 1,
      "dayEnd": 3,
      "description": "What they will do here"
    }
  ]
}
`;

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[DeepSeek Macro Parse] API error:", errText);
      return NextResponse.json({ error: "DeepSeek API call failed" }, { status: 500 });
    }

    const data = await response.json();
    let parsedData;
    try {
      parsedData = JSON.parse(data.choices[0].message.content);
    } catch (e) {
      console.error("[DeepSeek Macro Parse] Failed to parse JSON content:", data.choices[0].message.content);
      return NextResponse.json({ error: "Invalid JSON returned by AI" }, { status: 500 });
    }

    // Geocode each city with double fallbacks
    if (parsedData.cities && Array.isArray(parsedData.cities)) {
      for (const city of parsedData.cities) {
        let coords = null;
        
        // Try geocoding English Name first
        if (city.englishName) {
          coords = await geocodeAddress(city.englishName);
        }
        
        // Fallback to Chinese Name
        if (!coords && city.name) {
          coords = await geocodeAddress(city.name);
        }

        if (coords) {
          city.latitude = coords.lat;
          city.longitude = coords.lng;
        } else {
          // Defaults if geocoding fails
          city.latitude = 0;
          city.longitude = 0;
        }
      }
    }

    return NextResponse.json(parsedData);
  } catch (error) {
    console.error("[Macro Route] Error parsing macro plan:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
