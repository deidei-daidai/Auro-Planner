import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/maps";

export async function POST(req) {
  try {
    const { text, dayIndex } = await req.json();
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Input text is required" }, { status: 400 });
    }

    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: "DeepSeek API Key is not configured" }, { status: 500 });
    }

    // Call DeepSeek to parse the daily plan
    const systemPrompt = `You are a professional travel planner AI. Parse the unstructured travel text into a structured single-day timeline and event stream.
You must analyze the text carefully to extract:
1. The target day number (dayIndex, integer). If not clear, default to 1 or use the provided dayIndex value.
2. A list of scheduled events/spots in order. For each event:
   - "time": E.g., "09:00", "15:00", or null if not specified.
   - "title": Chinese name of the attraction, hotel, restaurant, or activity spot (e.g., "斗兽场", "罗马万豪酒店").
   - "englishTitle": The official English or local name of the attraction, hotel, restaurant, or activity spot (e.g., "Colosseum" for "斗兽场", "Rome Marriott Grand Hotel" for "罗马万豪酒店").
   - "description": Highly detailed and attractive description of WHAT to do or play at this location ("玩什么" activities, highlights, and tips).
   - "isHotel": Boolean. Set to true ONLY if this location is the accommodation/hotel for the night.
   - "transitMode": The transit mode *to the next spot* (either "DRIVING", "WALKING", "TRANSIT", "FLIGHT", or "TRAIN"). Deduce this from the text context. Default to "DRIVING" if not specified.
   - "bookingRequired": Boolean. Set to true if the text indicates that ticket booking, appointments, or reservations are required or highly recommended (e.g., "需要预约", "提前购票", "提前订票"). Otherwise default to false.
   - "bookingSession": String or null. The specific session/time slot mentioned for booking (e.g., "上午场", "14:00场"), or null if not specified.
   - "ticketPrice": String or null. Ticket price details (e.g., "€25", "180元", "免费"), or null if not specified.
   - "advanceBookingTime": String or null. Suggestion on how much in advance to book tickets (e.g., "建议提前30天", "提前1个月"), or null if not specified.
   - "bookingUrl": String or null. Official booking website URL if mentioned, or null.
   - "transitNotes": String or null. Crucial transit precautions, safety tips, driving alerts, ZTL warnings, or road tips for the route segment *to the next spot* (e.g., "此路段为老城区ZTL限行区，请避开自驾", "周日公交班次停运，建议打车", "右侧副驾驶侧可看海"). Default to null if not mentioned.

⚠️ CRITICAL RULE FOR TRANSPORTATION MOVEMENTS:
- Do NOT parse pure transportation movements, transfers, flights, or train trips (e.g. "机场快线直达市中心", "搭乘航班飞往奥斯陆", "乘大巴去卑尔根") as standalone attraction events/cards!
- Instead, represent these movements strictly as the 'transitMode' (e.g., FLIGHT, TRAIN, TRANSIT or DRIVING) and write the movement details (e.g. "乘机场快线直达市中心", "搭乘航班LH123飞往巴黎") into the 'description' of the PRECEDING event.
- Standalone event cards MUST strictly represent physical stay points (attractions, restaurants, hotels, parks, viewpoints) where travelers actually stop and visit.

You must return a valid JSON object matching the schema below. Do not include any markdown format blocks in your response, just return pure JSON.

JSON Schema:
{
  "dayIndex": 1,
  "events": [
    {
      "time": "09:00",
      "title": "斗兽场",
      "englishTitle": "Colosseum",
      "description": "游览宏伟的古罗马圆形剧场，参观角斗士通道，拍照机位推荐外墙合影。",
      "isHotel": false,
      "transitMode": "WALKING",
      "bookingRequired": true,
      "bookingSession": "上午场",
      "ticketPrice": "€25",
      "advanceBookingTime": "建议提前30天",
      "bookingUrl": "https://www.coopculture.it",
      "transitNotes": "古罗马遗迹区道路多为鹅卵石铺就，建议穿舒适运动鞋防滑。"
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
          { role: "user", content: `Day Index context (if known): ${dayIndex || "not provided"}\n\nText to parse:\n${text}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[DeepSeek Daily Parse] API error:", errText);
      return NextResponse.json({ error: "DeepSeek API call failed" }, { status: 500 });
    }

    const data = await response.json();
    let parsedData;
    try {
      parsedData = JSON.parse(data.choices[0].message.content);
    } catch (e) {
      console.error("[DeepSeek Daily Parse] Failed to parse JSON content:", data.choices[0].message.content);
      return NextResponse.json({ error: "Invalid JSON returned by AI" }, { status: 500 });
    }

    // Overlay explicit dayIndex if provided and resolved is null/invalid
    if (dayIndex !== undefined && dayIndex !== null) {
      parsedData.dayIndex = parseInt(dayIndex);
    }

    // Geocode each event spot with double fallbacks
    if (parsedData.events && Array.isArray(parsedData.events)) {
      for (const event of parsedData.events) {
        // Try geocoding English Title first if available for high-precision overseas search
        let coords = null;
        if (event.englishTitle) {
          coords = await geocodeAddress(event.englishTitle);
        }
        
        // Fallback to Chinese Title
        if (!coords && event.title) {
          coords = await geocodeAddress(event.title);
        }

        if (coords) {
          event.latitude = coords.lat;
          event.longitude = coords.lng;
          event.address = coords.address || null;
        } else {
          // Defaults if geocoding fails
          event.latitude = 0;
          event.longitude = 0;
          event.address = null;
        }
      }
    }

    return NextResponse.json(parsedData);
  } catch (error) {
    console.error("[Daily Route] Error parsing daily plan:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
