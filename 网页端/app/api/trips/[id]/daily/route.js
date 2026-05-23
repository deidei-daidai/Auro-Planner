import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req, { params }) {
  try {
    const { id } = params;
    const { dayIndex, events } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Trip ID is required" }, { status: 400 });
    }

    if (dayIndex === undefined || dayIndex === null) {
      return NextResponse.json({ error: "dayIndex is required" }, { status: 400 });
    }

    if (!events || !Array.isArray(events)) {
      return NextResponse.json({ error: "events array is required" }, { status: 400 });
    }

    // 1. Check parent trip validation
    const trip = await db.trip.findUnique({
      where: { id }
    });

    if (!trip) {
      return NextResponse.json({ error: "Trip framework not found in database. Please commit the main plan first." }, { status: 404 });
    }

    // 2. Validate dayIndex range
    const targetDay = parseInt(dayIndex);
    if (targetDay < 1 || targetDay > trip.totalDays) {
      return NextResponse.json({
        error: `Day index (${targetDay}) is invalid. It must be between 1 and ${trip.totalDays} days declared in the overall trip.`
      }, { status: 400 });
    }

    // 3. Transaction Guardian - Atomic Delete and Insert
    const createdEvents = await db.$transaction(async (tx) => {
      // Cascade delete existing events for this day index (sqlite will delete children in IntraPoint too)
      await tx.dailyEvent.deleteMany({
        where: {
          tripId: id,
          dayIndex: targetDay
        }
      });

      const inserted = [];
      for (const ev of events) {
        const newEvent = await tx.dailyEvent.create({
          data: {
            tripId: id,
            dayIndex: targetDay,
            time: ev.time,
            title: ev.title,
            englishTitle: ev.englishTitle || null,
            description: ev.description,
            transitMode: ev.transitMode || "DRIVING",
            latitude: parseFloat(ev.latitude) || 0,
            longitude: parseFloat(ev.longitude) || 0,
            isHotel: ev.isHotel || false
          }
        });
        inserted.push(newEvent);
      }
      return inserted;
    });

    return NextResponse.json({ success: true, count: createdEvents.length, events: createdEvents });
  } catch (error) {
    console.error("[Commit Daily Events API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
