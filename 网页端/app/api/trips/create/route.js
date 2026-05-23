import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req) {
  try {
    const { name, totalDays } = await req.json();
    
    if (!name || !totalDays) {
      return NextResponse.json({ error: "name and totalDays are required" }, { status: 400 });
    }

    const newTrip = await db.trip.create({
      data: {
        name,
        totalDays: parseInt(totalDays)
      }
    });

    return NextResponse.json(newTrip);
  } catch (error) {
    console.error("[Create Trip API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
