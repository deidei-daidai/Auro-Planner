import { create } from "zustand";

export const useTripStore = create((set, get) => ({
  trips: [],
  activeTripId: null,
  activeTrip: null,
  activeDayIndex: 1, // Currently selected day in the timeline
  
  // Sandbox buffers (holds uncommitted parsed plans)
  macroSandbox: null,        // { name, totalDays, summary, cities: [...] }
  sandboxBuffer: null,       // { dayIndex, events: [...] }
  sandboxIntraBuffer: null,  // { eventId, parentEventTitle, intraPoints: [...] }
  candidatePlaces: [],       // ⭐ Added: candidate places array for inspirations
  
  isLoading: false,
  errorMessage: null,
  isChannelActive: false,    // Flash green LED when message received from extension

  setChannelActive: (active) => set({ isChannelActive: active }),
  setErrorMessage: (msg) => set({ errorMessage: msg }),
  setActiveDayIndex: (dayIndex) => set({ activeDayIndex: dayIndex }),

  // Candidate places actions
  addCandidatePlace: (place) => set((state) => ({
    candidatePlaces: [
      ...state.candidatePlaces.filter(p => p.placeId !== place.placeId),
      place
    ]
  })),
  removeCandidatePlace: (placeId) => set((state) => ({
    candidatePlaces: state.candidatePlaces.filter(p => p.placeId !== placeId)
  })),
  clearCandidatePlaces: () => set({ candidatePlaces: [] }),

  // 1. Fetch all trips from db
  fetchTrips: async () => {
    set({ isLoading: true, errorMessage: null });
    try {
      const res = await fetch("/api/trips/list");
      if (!res.ok) throw new Error("Failed to load trips list");
      const data = await res.json();
      set({ trips: data, isLoading: false });
    } catch (err) {
      set({ errorMessage: err.message, isLoading: false });
    }
  },

  // 2. Select and recursively load a single trip with its events and intraPoints
  selectTrip: async (tripId) => {
    if (!tripId) {
      set({ activeTrip: null, activeTripId: null });
      return;
    }
    set({ isLoading: true, errorMessage: null, macroSandbox: null, sandboxBuffer: null, sandboxIntraBuffer: null });
    try {
      const res = await fetch(`/api/trips/${tripId}/get`);
      if (!res.ok) throw new Error("Failed to load trip details");
      const data = await res.json();
      set({ 
        activeTrip: data, 
        activeTripId: tripId, 
        isLoading: false,
        activeDayIndex: data.events.length > 0 ? data.events[0].dayIndex : 1 
      });
    } catch (err) {
      set({ errorMessage: err.message, isLoading: false });
    }
  },

  // 3. Clear all active sandbox states
  clearSandboxes: () => set({
    macroSandbox: null,
    sandboxBuffer: null,
    sandboxIntraBuffer: null
  }),

  // 4. Trigger Macro Parsing
  parseMacroPlan: async (text) => {
    set({ isLoading: true, errorMessage: null });
    try {
      const res = await fetch("/api/parse/macro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to parse macro structure");
      }
      const data = await res.json();
      set({ 
        macroSandbox: data, 
        sandboxBuffer: null,
        sandboxIntraBuffer: null,
        isLoading: false 
      });
    } catch (err) {
      set({ errorMessage: err.message, isLoading: false });
    }
  },

  // 5. Trigger Daily Plan Parsing
  parseDailyPlan: async (text, dayIndex) => {
    set({ isLoading: true, errorMessage: null });
    try {
      const res = await fetch("/api/parse/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dayIndex })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to parse daily details");
      }
      const data = await res.json();
      set({ 
        sandboxBuffer: data, 
        macroSandbox: null,
        sandboxIntraBuffer: null,
        isLoading: false 
      });
    } catch (err) {
      set({ errorMessage: err.message, isLoading: false });
    }
  },

  // 6. Trigger Micro Scenic Path Parsing
  parseMicroPlan: async (text, eventId, eventTitle) => {
    set({ isLoading: true, errorMessage: null });
    try {
      const res = await fetch("/api/parse/micro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, eventId, parentEventTitle: eventTitle })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to parse scenic walkthrough");
      }
      const data = await res.json();
      set({ 
        sandboxIntraBuffer: {
          eventId,
          parentEventTitle: eventTitle,
          intraPoints: data.intraPoints
        },
        macroSandbox: null,
        sandboxBuffer: null,
        isLoading: false 
      });
    } catch (err) {
      set({ errorMessage: err.message, isLoading: false });
    }
  },

  // 7. Update Daily Event fields in sandbox (Time & TransitMode allowed, title/GPS read-only)
  updateSandboxEvent: (index, updatedFields) => {
    const { sandboxBuffer } = get();
    if (!sandboxBuffer || !sandboxBuffer.events) return;

    const newEvents = [...sandboxBuffer.events];
    newEvents[index] = {
      ...newEvents[index],
      ...updatedFields // e.g. { time: "09:30" } or { transitMode: "WALKING" }
    };

    set({
      sandboxBuffer: {
        ...sandboxBuffer,
        events: newEvents
      }
    });
  },

  // 8. Update/re-order micro points in sandbox
  updateSandboxIntraPoints: (newPoints) => {
    const { sandboxIntraBuffer } = get();
    if (!sandboxIntraBuffer) return;

    set({
      sandboxIntraBuffer: {
        ...sandboxIntraBuffer,
        intraPoints: newPoints.map((pt, idx) => ({ ...pt, sortOrder: idx }))
      }
    });
  },

  // 9. Commit Trip framework to database
  commitMacroPlan: async () => {
    const { macroSandbox } = get();
    if (!macroSandbox) return;

    set({ isLoading: true, errorMessage: null });
    try {
      const res = await fetch("/api/trips/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: macroSandbox.name,
          totalDays: macroSandbox.totalDays
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create trip record");
      }
      const data = await res.json();
      
      // Refresh list, select the new trip, and clear sandbox
      await get().fetchTrips();
      await get().selectTrip(data.id);
      set({ macroSandbox: null, isLoading: false });
    } catch (err) {
      set({ errorMessage: err.message, isLoading: false });
    }
  },

  // 10. Commit Single Day Events to SQLite with outer validations (supports saving transitDurations)
  commitDailyPlan: async (customEvents = null) => {
    const { sandboxBuffer, activeTripId } = get();
    if (!sandboxBuffer || !activeTripId) return;

    set({ isLoading: true, errorMessage: null });
    try {
      const res = await fetch(`/api/trips/${activeTripId}/daily`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayIndex: sandboxBuffer.dayIndex,
          events: customEvents || sandboxBuffer.events
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Daily commit transaction failed");
      }

      // Refresh current trip structure and clean sandbox
      await get().selectTrip(activeTripId);
      set({ sandboxBuffer: null, isLoading: false });
    } catch (err) {
      set({ errorMessage: err.message, isLoading: false });
    }
  },

  // 11. Commit Micro scenic walkthrough points with anti-orphan check
  commitMicroPlan: async () => {
    const { sandboxIntraBuffer, activeTripId } = get();
    if (!sandboxIntraBuffer || !activeTripId) return;

    set({ isLoading: true, errorMessage: null });
    try {
      const res = await fetch(`/api/trips/${activeTripId}/micro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: sandboxIntraBuffer.eventId,
          intraPoints: sandboxIntraBuffer.intraPoints
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Micro path commit failed");
      }

      // Refresh current trip structure and clean sandbox
      await get().selectTrip(activeTripId);
      set({ sandboxIntraBuffer: null, isLoading: false });
    } catch (err) {
      set({ errorMessage: err.message, isLoading: false });
    }
  },

  // 12. Delete Trip
  deleteTrip: async (tripId) => {
    if (!tripId) return;
    set({ isLoading: true, errorMessage: null });
    try {
      const res = await fetch(`/api/trips/${tripId}/delete`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete trip");
      
      // Select another trip if the active one was deleted
      const currentActive = get().activeTripId;
      await get().fetchTrips();
      
      if (currentActive === tripId) {
        const nextTrip = get().trips.length > 0 ? get().trips[0].id : null;
        await get().selectTrip(nextTrip);
      }
      set({ isLoading: false });
    } catch (err) {
      set({ errorMessage: err.message, isLoading: false });
    }
  }
}));
