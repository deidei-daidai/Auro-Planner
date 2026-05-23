import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/maps";

export async function POST(req) {
  try {
    const { text, parentEventTitle, eventId } = await req.json();
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Input text is required" }, { status: 400 });
    }

    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: "DeepSeek API Key is not configured" }, { status: 500 });
    }

    // Call DeepSeek to parse the micro scenic path
    const systemPrompt = `You are a professional travel planner AI. Parse the unstructured text into a sequence of micro-locations/walkthrough points inside a single main attraction (e.g. inside the Colosseum, or inside Louvre).
Extract a sequential list of internal scenic spots. For each spot:
- "title": Chinese name of the internal location (e.g. "地下层", "看台二层", "小凯旋门").
- "englishTitle": The official English or local name of the internal location (e.g. "Underground chambers", "Second tier stands", "Triumphal Arch").
- "description": Activities, photo spots, or historical remarks ("玩什么" activities and tips).
- "sortOrder": Integer starting from 0 representing the walking sequence.

You must return a valid JSON object matching the schema below. Do not include any markdown format blocks in your response, just return pure JSON.

JSON Schema:
{
  "intraPoints": [
    {
      "title": "地下层",
      "englishTitle": "Underground chambers",
      "description": "看角斗士和猛兽曾经等待的地方，推荐戴上讲解器。",
      "sortOrder": 0
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
          { role: "user", content: `Main Landmark Name: ${parentEventTitle || "not provided"}\n\nText to parse:\n${text}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[DeepSeek Micro Parse] API error:", errText);
      return NextResponse.json({ error: "DeepSeek API call failed" }, { status: 500 });
    }

    const data = await response.json();
    let parsedData;
    try {
      parsedData = JSON.parse(data.choices[0].message.content);
    } catch (e) {
      console.error("[DeepSeek Micro Parse] Failed to parse JSON content:", data.choices[0].message.content);
      return NextResponse.json({ error: "Invalid JSON returned by AI" }, { status: 500 });
    }

    // Geocode each micro spot
    // To make geocoding precise, combine the parent landmark title with the sub-spot title
    if (parsedData.intraPoints && Array.isArray(parsedData.intraPoints)) {
      for (const spot of parsedData.intraPoints) {
        let coords = null;
        
        // Priority 1: Parent Landmark Name + English Sub-spot Name
        if (parentEventTitle && spot.englishTitle) {
          coords = await geocodeAddress(`${parentEventTitle} ${spot.englishTitle}`);
        }
        
        // Priority 2: Parent Landmark Name + Chinese Sub-spot Name
        if (!coords && parentEventTitle && spot.title) {
          coords = await geocodeAddress(`${parentEventTitle} ${spot.title}`);
        }
        
        // Fallback: Sub-spot English title alone
        if (!coords && spot.englishTitle) {
          coords = await geocodeAddress(spot.englishTitle);
        }

        if (coords) {
          spot.latitude = coords.lat;
          spot.longitude = coords.lng;
        } else {
          // Defaults if geocoding fails
          spot.latitude = 0;
          spot.longitude = 0;
        }
      }
    }

    // Attach eventId if available
    if (eventId) {
      parsedData.eventId = eventId;
    }

    return NextResponse.json(parsedData);
  } catch (error) {
    console.error("[Micro Route] Error parsing micro plan:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
