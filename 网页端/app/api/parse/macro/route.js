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

⚠️ CRITICAL DESIGN SPECIFICATIONS FOR TRAVEL STAGES (SUPPORTING SELF-DRIVING, SCENIC HIGHWAYS & MULTI-CITY TRANSIT):
1. The "cities" array represents chronological "游览阶段/中继路径/自驾或中转大节点 (Travel Stages/Route Segments/Transit Hubs)" rather than just strict municipal cities.
2. For self-driving roads, scenic driving tracks, or regional natural areas (e.g. "大洋路自驾线", "浪漫之路自驾段", "独库公路自驾段"):
   - "name": Use the Chinese descriptive name (e.g. "大洋路自驾线" or "国王湖与自然保护区").
   - "englishName": MUST be a clean, standard, internationally recognized geographical name or landmark that represents either the road itself or a main landmark along it (e.g. "Great Ocean Road", "Konigssee", "Twelve Apostles Victoria") to guarantee 100% successful Google Maps geocoding. Do NOT include words like "self-drive", "transit", or custom symbols in the englishName.
3. For cross-destination transition segments (e.g. when a traveler spends half a day traveling from one city to another, like Day 3 Paris to Rome):
   - "name": Use an elegant Chinese display name showing the transition (e.g. "巴黎 ➡️ 罗马 (跨国转场)").
   - "englishName": MUST be a clean, real-world geocodable name of a key transit hub (railway station, airport, highway interchange) where they transfer (e.g. "Gare de Lyon Paris", "Rome Termini Station", "Frankfurt Airport") to ensure Google Maps can geocode it and draw a beautiful transit node on the map.
4. Support day overlaps! If a traveler spends D3 morning in Paris and D3 evening in Rome, Paris can end on Day 3 (dayEnd: 3), the Paris-Rome transit can be on Day 3 (dayStart: 3, dayEnd: 3), and Rome can start on Day 3 (dayStart: 3, dayEnd: 5).

JSON Schema:
{
  "name": "Trip Name (e.g. 澳大利亚大洋路自驾与都市经典之旅)",
  "totalDays": 10,
  "summary": "Short overall description of the trip, routing, and travel highlights",
  "cities": [
    {
      "name": "游览大节点中文名称 (e.g. '巴黎', '大洋路自驾线', '巴黎 ➡️ 罗马 (高铁转场)')",
      "englishName": "A clean, real-world, internationally recognized English geographical name, road, or transit hub for high-precision Google Maps geocoding (e.g. 'Paris', 'Great Ocean Road', 'Rome Termini Station'). NO custom symbols, emojis, or transit words",
      "dayStart": 1,
      "dayEnd": 3,
      "description": "Details of activities in this stage"
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
