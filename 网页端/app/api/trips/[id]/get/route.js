import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req, { params }) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Trip ID is required" }, { status: 400 });
    }

    const trip = await db.trip.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: [
            { dayIndex: "asc" },
            { time: "asc" }
          ],
          include: {
            intraPoints: {
              orderBy: {
                sortOrder: "asc"
              }
            }
          }
        }
      }
    });

    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    return NextResponse.json(trip);
  } catch (error) {
    console.error("[Get Trip API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
