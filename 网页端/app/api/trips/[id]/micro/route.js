import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req, { params }) {
  try {
    const { id: tripId } = params;
    const { eventId, intraPoints } = await req.json();

    if (!tripId) {
      return NextResponse.json({ error: "Trip ID is required" }, { status: 400 });
    }

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    if (!intraPoints || !Array.isArray(intraPoints)) {
      return NextResponse.json({ error: "intraPoints array is required" }, { status: 400 });
    }

    // 1. Validation - Ensure parent daily event exists in this trip
    const parentEvent = await db.dailyEvent.findFirst({
      where: {
        id: eventId,
        tripId: tripId
      }
    });

    if (!parentEvent) {
      return NextResponse.json({
        error: `Parent attraction event (eventId: ${eventId}) does not exist under this trip. You must COMMIT the daily plan first before planning its internal route!`
      }, { status: 404 });
    }

    // 2. Transaction Guardian - Atomic Delete and Insert
    const createdPoints = await db.$transaction(async (tx) => {
      // Delete existing micro points for this event
      await tx.intraPoint.deleteMany({
        where: { eventId }
      });

      const inserted = [];
      for (const [index, pt] of intraPoints.entries()) {
        const newPoint = await tx.intraPoint.create({
          data: {
            eventId: eventId,
            title: pt.title,
            englishTitle: pt.englishTitle || null,
            description: pt.description,
            latitude: parseFloat(pt.latitude) || 0,
            longitude: parseFloat(pt.longitude) || 0,
            sortOrder: pt.sortOrder !== undefined ? parseInt(pt.sortOrder) : index
          }
        });
        inserted.push(newPoint);
      }
      return inserted;
    });

    return NextResponse.json({ success: true, count: createdPoints.length, intraPoints: createdPoints });
  } catch (error) {
    console.error("[Commit Micro Points API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
