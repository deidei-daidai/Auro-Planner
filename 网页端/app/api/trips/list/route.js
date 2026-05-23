import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const trips = await db.trip.findMany({
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json(trips);
  } catch (error) {
    console.error("[List Trips API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
