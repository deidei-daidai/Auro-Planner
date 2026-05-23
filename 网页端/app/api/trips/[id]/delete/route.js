import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(req, { params }) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Trip ID is required" }, { status: 400 });
    }

    const trip = await db.trip.findUnique({
      where: { id }
    });

    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Delete trip. Prisma onDelete: Cascade automatically deletes child events & intraPoints
    await db.trip.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: `Trip "${trip.name}" successfully deleted along with all its events and routes.` });
  } catch (error) {
    console.error("[Delete Trip API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
