"use client";

import { useEffect, useRef, useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { Loader } from "@googlemaps/js-api-loader";
import { 
  Compass, 
  MapPin, 
  Navigation, 
  Trash2, 
  Plus, 
  Check, 
  AlertTriangle, 
  Loader2, 
  ChevronRight, 
  Hotel, 
  ArrowUp, 
  ArrowDown, 
  Calendar 
} from "lucide-react";

export default function AuroMapPage() {
  const {
    trips,
    activeTripId,
    activeTrip,
    activeDayIndex,
    macroSandbox,
    sandboxBuffer,
    sandboxIntraBuffer,
    isLoading,
    errorMessage,
    isChannelActive,
    fetchTrips,
    selectTrip,
    clearSandboxes,
    parseMacroPlan,
    parseDailyPlan,
    parseMicroPlan,
    updateSandboxEvent,
    updateSandboxIntraPoints,
    commitMacroPlan,
    commitDailyPlan,
    commitMicroPlan,
    deleteTrip,
    setActiveDayIndex,
    setChannelActive,
    setErrorMessage
  } = useTripStore();

  const [inputText, setInputText] = useState("");
  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [newTripDays, setNewTripDays] = useState(5);
  const [hotelWarning, setHotelWarning] = useState(null);

  // References for map initialization
  const mapRef = useRef(null);
  const googleMap = useRef(null);
  const mapMarkers = useRef([]);
  const mapPolylines = useRef([]);
  const directionsService = useRef(null);

  // 1. Initial Load - Load available trips
  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  // 2. Chrome Extension Message Listener
  useEffect(() => {
    const handleScrapePayload = (e) => {
      console.log("[AuroMap Web App] Payload received via CustomEvent:", e.detail);
      setInputText(e.detail);
      setChannelActive(true);
      
      // Visual feedback: brief flash
      setTimeout(() => {
        setChannelActive(false);
      }, 3000);
    };

    window.addEventListener("auro-scrape-payload", handleScrapePayload);
    return () => {
      window.removeEventListener("auro-scrape-payload", handleScrapePayload);
    };
  }, [setChannelActive]);

  // 3. Load Google Maps JS API
  useEffect(() => {
    async function initMap() {
      try {
        const res = await fetch("/api/maps-key");
        const { key } = await res.json();

        const loader = new Loader({
          apiKey: key,
          version: "weekly",
          libraries: ["places"]
        });

        const google = await loader.load();
        
        // Custom Warm Linen style JSON HSL(38, 20%, 93%)
        const mapStyle = [
          { elementType: "geometry", stylers: [{ color: "#ebe8e1" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#524f48" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#fdfcf9" }] },
          { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d4cebf" }] },
          { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e6e2da" }] },
          { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e0dcce" }] },
          { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#756d5e" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#f9f8f6" }] },
          { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e6decb" }] },
          { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d7cda9" }] },
          { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e6e2da" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#cbdad5" }] },
          { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a5953" }] }
        ];

        const mapOptions = {
          center: { lat: 41.9028, lng: 12.4964 }, // Center in Rome by default
          zoom: 12,
          styles: mapStyle,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false
        };

        const mapInstance = new google.maps.Map(mapRef.current, mapOptions);
        googleMap.current = mapInstance;
        directionsService.current = new google.maps.DirectionsService();

        console.log("[AuroMap] Google Maps successfully initialized!");
      } catch (err) {
        console.error("[AuroMap] Error loading Google Maps:", err);
      }
    }

    if (mapRef.current && !googleMap.current) {
      initMap();
    }
  }, []);

  // 4. Accommodation Continuity Check (Hotel Continuity Validation)
  useEffect(() => {
    if (!activeTrip || activeTrip.events.length === 0) {
      setHotelWarning(null);
      return;
    }

    // Check hotel continuity between consecutive days
    const events = activeTrip.events;
    const days = [...new Set(events.map(e => e.dayIndex))].sort((a,b) => a-b);
    
    let warningMsg = null;

    for (let i = 0; i < days.length - 1; i++) {
      const currentDay = days[i];
      const nextDay = days[i+1];
      
      const currentDayEvents = events.filter(e => e.dayIndex === currentDay);
      const nextDayEvents = events.filter(e => e.dayIndex === nextDay);
      
      // Find the last event of the current day
      const lastEvent = currentDayEvents[currentDayEvents.length - 1];
      // Find the first event of the next day
      const firstEvent = nextDayEvents[0];

      // If the last event of the current day is not a hotel, or we want to match hotel to start
      const lastHotel = currentDayEvents.find(e => e.isHotel);
      
      if (lastHotel && firstEvent) {
        // Calculate geographical distance in km
        const dist = getHaversineDistance(
          lastHotel.latitude, lastHotel.longitude,
          firstEvent.latitude, firstEvent.longitude
        );

        // If distance is larger than 1.5 km and first event is not a transit transfer, warn!
        if (dist > 1.5 && !firstEvent.title.includes("自驾") && !firstEvent.title.includes("坐车")) {
          warningMsg = `⚠️ 时空对齐警告：第 ${currentDay} 天的住宿地点（${lastHotel.title}）与第 ${nextDay} 天的起点（${firstEvent.title}）距离相隔较远 (${dist.toFixed(1)} km)，可能存在行程断链。`;
          break;
        }
      }
    }

    setHotelWarning(warningMsg);
  }, [activeTrip]);

  // Utility to calculate geodesic distance in km
  function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // 5. Redraw Map Layers based on active state (Multi-Scale Rendering)
  useEffect(() => {
    if (!googleMap.current) return;

    // Clear previous markers
    mapMarkers.current.forEach(m => m.setMap(null));
    mapMarkers.current = [];

    // Clear previous polylines
    mapPolylines.current.forEach(p => p.setMap(null));
    mapPolylines.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    const gMap = googleMap.current;

    // SCENARIO 1: Macro Sandbox Preview (Trip outline)
    if (macroSandbox && macroSandbox.cities && macroSandbox.cities.length > 0) {
      console.log("[Map Re-render] Macro sandbox active");
      
      const cityPathCoords = [];

      macroSandbox.cities.forEach((city, index) => {
        if (city.latitude === 0 && city.longitude === 0) return;

        const pos = { lat: city.latitude, lng: city.longitude };
        cityPathCoords.push(pos);
        bounds.extend(pos);

        // Marker: Bronze double ring marker for Macro city with elegant floating Outfit label
        const marker = new window.google.maps.Marker({
          position: pos,
          map: gMap,
          title: city.englishName ? `${city.name} (${city.englishName})` : city.name,
          label: {
            text: city.englishName ? `${city.name}\n(${city.englishName})` : city.name,
            color: "#2e2b25", // deep bronze clay
            fontSize: "11px", // slightly smaller for multi-line balance
            fontWeight: "700",
            fontFamily: "var(--font-outfit)"
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "#d99b26", // Bronze Amber Gold
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 8,
            labelOrigin: new window.google.maps.Point(0, -2.4) // Adjust offset slightly higher for multi-line
          }
        });
        
        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div class="custom-infowindow"><h4>${city.name}</h4><p>第 ${city.dayStart} 天 - 第 ${city.dayEnd} 天</p><p>${city.description || ""}</p></div>`
        });

        marker.addListener("click", () => infoWindow.open(gMap, marker));
        mapMarkers.current.push(marker);
      });

      // Arc/Wide dashed line connecting macro centers (Macro Arc Route)
      const macroPolyline = new window.google.maps.Polyline({
        path: cityPathCoords,
        geodesic: true,
        map: gMap,
        strokeColor: "#d99b26",
        strokeOpacity: 0,
        icons: [{
          icon: {
            path: "M 0,-1 0,1",
            strokeColor: "#d99b26",
            strokeOpacity: 0.5,
            scale: 2
          },
          offset: "0",
          repeat: "12px"
        }],
        strokeWeight: 4
      });

      mapPolylines.current.push(macroPolyline);
      
      if (cityPathCoords.length > 0) {
        gMap.fitBounds(bounds);
        const listener = gMap.addListener("bounds_changed", () => {
          if (gMap.getZoom() > 8) {
            gMap.setZoom(8); // limit close-up zoom for single cities
          }
          window.google.maps.event.removeListener(listener);
        });
      }
      return;
    }

    // SCENARIO 2: Daily Sandbox Preview (Real road network dashed path)
    if (sandboxBuffer && sandboxBuffer.events && sandboxBuffer.events.length > 0) {
      console.log("[Map Re-render] Daily sandbox active");
      
      const events = sandboxBuffer.events;
      drawRoadItinerary(events, true); // true = dashed preview state
      return;
    }

    // SCENARIO 3: Micro Internal Sandbox Walkthrough ( tilt closeup dotted walk )
    if (sandboxIntraBuffer && sandboxIntraBuffer.intraPoints && sandboxIntraBuffer.intraPoints.length > 0) {
      console.log("[Map Re-render] Micro sandbox active");
      
      const pts = sandboxIntraBuffer.intraPoints;
      const walkCoords = [];

      pts.forEach((pt, index) => {
        if (pt.latitude === 0 && pt.longitude === 0) return;

        const pos = { lat: pt.latitude, lng: pt.longitude };
        walkCoords.push(pos);
        bounds.extend(pos);

        // Marker: Tiny terracotta red dot (4px) with soft white border
        const marker = new window.google.maps.Marker({
          position: pos,
          map: gMap,
          title: pt.title,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "#c05c46", // Terracotta Red
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 1.5,
            scale: 5
          }
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div class="custom-infowindow"><h4>${pt.title}</h4><p>景点内部点 - 游玩排序: ${pt.sortOrder + 1}</p><p>${pt.description || ""}</p></div>`
        });

        marker.addListener("click", () => infoWindow.open(gMap, marker));
        mapMarkers.current.push(marker);
      });

      // Draw dotted walking path inside scenic spot
      const walkPolyline = new window.google.maps.Polyline({
        path: walkCoords,
        geodesic: true,
        map: gMap,
        strokeColor: "#faf9f5",
        strokeOpacity: 0,
        icons: [{
          icon: {
            path: "M 0,-1 0,1",
            strokeColor: "#c05c46",
            strokeOpacity: 0.8,
            scale: 1.5
          },
          offset: "0",
          repeat: "8px"
        }],
        strokeWeight: 3
      });

      mapPolylines.current.push(walkPolyline);
      
      // Fit to extreme close up zoom and tilt map asynchronously if supported
      if (walkCoords.length > 0) {
        gMap.fitBounds(bounds);
        const listener = gMap.addListener("bounds_changed", () => {
          if (gMap.getZoom() > 18) {
            gMap.setZoom(18);
          }
          gMap.setTilt(45); // 3D closeup tilt angle!
          window.google.maps.event.removeListener(listener);
        });
      }
      return;
    }

    // SCENARIO 4: Resting Committed State (Solid physical paths + micro walkthroughs overlay)
    if (activeTrip && activeTrip.events && activeTrip.events.length > 0) {
      console.log("[Map Re-render] Committed active trip rendering");
      
      // Filter events to only render the selected activeDayIndex
      const dayEvents = activeTrip.events.filter(e => e.dayIndex === activeDayIndex);
      
      if (dayEvents.length > 0) {
        drawRoadItinerary(dayEvents, false); // false = solid committed paths
      }
    }
  }, [activeTrip, activeDayIndex, macroSandbox, sandboxBuffer, sandboxIntraBuffer]);

  // Core helper to retrieve Directions API path and draw road network polylines (Real-road Routing)
  async function drawRoadItinerary(events, isPreview = false) {
    const gMap = googleMap.current;
    const bounds = new window.google.maps.LatLngBounds();

    // 1. Draw all daily POI Markers
    events.forEach((ev, index) => {
      if (ev.latitude === 0 && ev.longitude === 0) return;

      const pos = { lat: ev.latitude, lng: ev.longitude };
      bounds.extend(pos);

      // Color coding marker
      let markerColor = "#c05c46"; // default Terracotta Red
      if (ev.isHotel) markerColor = "#5a8f76"; // Hotel gets Sage Green
      
      // Marker: shield-badge numbered marker
      const marker = new window.google.maps.Marker({
        position: pos,
        map: gMap,
        title: ev.englishTitle ? `${ev.title} (${ev.englishTitle})` : ev.title,
        label: {
          text: ev.isHotel ? "🏠" : String(index + 1),
          color: "#ffffff",
          fontSize: "12px",
          fontWeight: "bold"
        },
        icon: {
          path: "M 0,-12 L 10,-8 L 10,4 L 0,12 L -10,4 L -10,-8 Z", // custom elegant shield path
          fillColor: markerColor,
          fillOpacity: 0.95,
          strokeColor: "#faf9f5",
          strokeWeight: 2,
          scale: 1.5,
          labelOrigin: new window.google.maps.Point(0, -1)
        }
      });

      // Auxiliary Marker: Floats the bilingual name above the shield badge (Dual-Marker Overlay Hack!)
      const labelText = ev.englishTitle ? `${ev.title}\n(${ev.englishTitle})` : ev.title;
      const labelMarker = new window.google.maps.Marker({
        position: pos,
        map: gMap,
        label: {
          text: labelText,
          color: "#2e2b25", // deep bronze clay
          fontSize: "10px", // neat and readable
          fontWeight: "700",
          fontFamily: "var(--font-outfit)"
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillOpacity: 0,
          strokeOpacity: 0,
          scale: 1,
          labelOrigin: new window.google.maps.Point(0, -3.2) // Float Y-axis above the shield badge
        }
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `<div class="custom-infowindow">
          <h4>${ev.title} ${ev.englishTitle ? `<span style="font-size:11px;font-style:italic;color:var(--muted-clay-text)">(${ev.englishTitle})</span>` : ""}</h4>
          <p>时间: ${ev.time || "全天"}</p>
          <p>${ev.description || ""}</p>
          ${ev.isHotel ? "<span class='hotel-badge'>🏠 住宿酒店</span>" : ""}
        </div>`
      });

      marker.addListener("click", () => infoWindow.open(gMap, marker));
      labelMarker.addListener("click", () => infoWindow.open(gMap, marker));
      mapMarkers.current.push(marker);
      mapMarkers.current.push(labelMarker);

      // Draw recursive committed IntraPoints for this POI if available and no sandbox is active
      if (!isPreview && ev.intraPoints && ev.intraPoints.length > 0) {
        const intraCoords = [];
        ev.intraPoints.forEach(pt => {
          const ptPos = { lat: pt.latitude, lng: pt.longitude };
          intraCoords.push(ptPos);
          
          // Tiny micro point circle
          const ptMarker = new window.google.maps.Marker({
            position: ptPos,
            map: gMap,
            title: pt.title,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: "#c05c46",
              fillOpacity: 0.9,
              strokeColor: "#faf9f5",
              strokeWeight: 1,
              scale: 3.5
            }
          });
          mapMarkers.current.push(ptMarker);
        });

        // Fine solid walking path inside attraction
        const intraPolyline = new window.google.maps.Polyline({
          path: [pos, ...intraCoords],
          geodesic: true,
          map: gMap,
          strokeColor: "#faf9f5", // Solid warm white line
          strokeOpacity: 0.95,
          strokeWeight: 3.5,
          strokePattern: "solid"
        });
        mapPolylines.current.push(intraPolyline);
      }
    });

    // 2. Query Directions between successive points along the road network
    for (let i = 0; i < events.length - 1; i++) {
      const origin = events[i];
      const destination = events[i+1];

      if (origin.latitude === 0 || origin.longitude === 0 || destination.latitude === 0 || destination.longitude === 0) continue;

      const originPos = new window.google.maps.LatLng(origin.latitude, origin.longitude);
      const destPos = new window.google.maps.LatLng(destination.latitude, destination.longitude);

      // Map transit mode
      let googleMode = window.google.maps.TravelMode.DRIVING;
      let lineColor = "#c05c46"; // driving color: Terracotta Red
      
      const mode = (origin.transitMode || "DRIVING").toUpperCase();
      if (mode === "WALKING") {
        googleMode = window.google.maps.TravelMode.WALKING;
        lineColor = "#5a8f76"; // walking color: Sage Green
      } else if (mode === "TRANSIT") {
        googleMode = window.google.maps.TravelMode.TRANSIT;
        lineColor = "#d99b26"; // transit color: Amber Gold
      }

      const request = {
        origin: originPos,
        destination: destPos,
        travelMode: googleMode
      };

      directionsService.current.route(request, (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          const path = result.routes[0].overview_path;

          let polyline;
          if (isPreview) {
            // Dash polyline for preview
            polyline = new window.google.maps.Polyline({
              path: path,
              geodesic: true,
              map: gMap,
              strokeColor: lineColor,
              strokeOpacity: 0,
              icons: [{
                icon: {
                  path: "M 0,-1 0,1",
                  strokeColor: lineColor,
                  strokeOpacity: 0.7,
                  scale: 2
                },
                offset: "0",
                repeat: "10px"
              }],
              strokeWeight: 4
            });
          } else {
            // Solid polyline with shadow effect for committed plan
            polyline = new window.google.maps.Polyline({
              path: path,
              geodesic: true,
              map: gMap,
              strokeColor: lineColor,
              strokeOpacity: 0.95,
              strokeWeight: 5
            });
          }

          mapPolylines.current.push(polyline);
        } else {
          console.warn(`[Directions Service] Route request failed: ${status}. Fallback to geodesic line.`);
          // Fallback to straight line if directions route fails
          const fallbackPolyline = new window.google.maps.Polyline({
            path: [originPos, destPos],
            map: gMap,
            strokeColor: lineColor,
            strokeOpacity: isPreview ? 0.4 : 0.8,
            strokeWeight: isPreview ? 3 : 4,
            icons: isPreview ? [{
              icon: { path: "M 0,-1 0,1", strokeColor: lineColor, strokeOpacity: 0.7, scale: 2 },
              offset: "0", repeat: "10px"
            }] : []
          });
          mapPolylines.current.push(fallbackPolyline);
        }
      });
    }

    gMap.fitBounds(bounds);
    
    // Set a reasonable max zoom for regional daily overview
    const listener = gMap.addListener("bounds_changed", () => {
      if (gMap.getZoom() > 16) gMap.setZoom(16);
      gMap.setTilt(0); // Flat view for daily overview
      window.google.maps.event.removeListener(listener);
    });
  }

  // Handle Commit button clicks
  const handleCommit = async () => {
    if (macroSandbox) {
      await commitMacroPlan();
      setInputText("");
    } else if (sandboxBuffer) {
      await commitDailyPlan();
      setInputText("");
    } else if (sandboxIntraBuffer) {
      await commitMicroPlan();
      setInputText("");
    }
  };

  // Re-order micro points in sandbox (move up/down button handlers)
  const moveMicroPoint = (index, direction) => {
    if (!sandboxIntraBuffer || !sandboxIntraBuffer.intraPoints) return;
    const list = [...sandboxIntraBuffer.intraPoints];
    const targetIdx = index + direction;
    
    if (targetIdx < 0 || targetIdx >= list.length) return;
    
    // Swap
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    
    updateSandboxIntraPoints(list);
  };

  return (
    <main className="auromap-viewport">
      {/* 1. Underlying Map Canvas Layer */}
      <div ref={mapRef} className="auromap-map-container" />

      {/* 2. Top-level Error Toaster */}
      {errorMessage && (
        <div className="toast-error" onClick={() => setErrorMessage(null)}>
          {errorMessage}
          <span style={{ marginLeft: 16, cursor: "pointer", fontSize: 11, textTransform: "uppercase" }}>✕ 关闭</span>
        </div>
      )}

      {/* 3. Floating Left Canvas Hand-ledger Control Cabin */}
      <section className="auromap-console">
        {/* TOP BRAND HEADER & ASSET MENU */}
        <div className="console-header">
          <div className="brand">
            <Compass size={24} strokeWidth={2.5} className="animate-spin-slow" />
            <span>AuroMap</span>
          </div>

          <div className="asset-menu-container">
            <select
              value={activeTripId || ""}
              onChange={(e) => selectTrip(e.target.value)}
              className="asset-dropdown"
            >
              <option value="">📂 选择时空行程...</option>
              {trips.map(trip => (
                <option key={trip.id} value={trip.id}>
                  📅 {trip.name} ({trip.totalDays}天)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* WORKSPACE AREA (SCROLLABLE) */}
        <div className="console-workspace">
          
          {/* Dual-Channel scrape receiver slot */}
          <div className={`scrape-receiver-box ${inputText ? "focus-glow" : ""}`}>
            <div className="scrape-header-row">
              <span className="scrape-title">旁路中转抓取接收器</span>
              <div className="led-indicator">
                <span className={`led-light ${isChannelActive ? "active" : ""}`} />
                <span>{isChannelActive ? "抓取瞬间绿光涌入..." : "监听中"}</span>
              </div>
            </div>
            
            <textarea
              className="scraped-textarea"
              placeholder="在这里粘贴非结构化旅行行程，或直接在 AI 聊天页面点击 Scrape 抓取按钮自动涌入..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />

            {/* Micro trigger buttons */}
            <div className="triple-trigger-buttons">
              <button
                onClick={() => parseMacroPlan(inputText)}
                disabled={isLoading || !inputText}
                className="satin-button"
              >
                <Calendar size={14} />
                <span>整体框架 (Macro)</span>
              </button>
              <button
                onClick={() => parseDailyPlan(inputText, activeDayIndex)}
                disabled={isLoading || !inputText || !activeTripId}
                className="satin-button"
              >
                <Navigation size={14} />
                <span>单日细节 (Daily)</span>
              </button>
              <button
                onClick={() => {
                  // Find first event to plan micro
                  const dayEvents = activeTrip?.events.filter(e => e.dayIndex === activeDayIndex) || [];
                  if (dayEvents.length > 0) {
                    parseMicroPlan(inputText, dayEvents[0].id, dayEvents[0].title);
                  } else {
                    alert("当前日期没有景点事件，请先添加单日细节！");
                  }
                }}
                disabled={isLoading || !inputText || !activeTripId}
                className="satin-button"
              >
                <MapPin size={14} />
                <span>景内微观 (Micro)</span>
              </button>
            </div>
          </div>

          {/* Accommodation continuity alerts */}
          {hotelWarning && (
            <div className="alert-banner">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{hotelWarning}</div>
            </div>
          )}

          {/* ACTIVE TRIP DETAILS & TIMELINE */}
          {activeTrip && (
            <div className="timeline-section">
              {/* Day Tabs Selectors */}
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, marginBottom: 12 }}>
                {Array.from({ length: activeTrip.totalDays }, (_, i) => i + 1).map(day => (
                  <button
                    key={day}
                    onClick={() => {
                      clearSandboxes();
                      setActiveDayIndex(day);
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 10,
                      fontFamily: "var(--font-outfit)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "1px solid",
                      background: activeDayIndex === day ? "var(--terracotta-red)" : "transparent",
                      color: activeDayIndex === day ? "#ffffff" : "var(--muted-clay-text)",
                      borderColor: activeDayIndex === day ? "var(--terracotta-red)" : "rgba(109, 102, 90, 0.2)"
                    }}
                  >
                    Day {day}
                  </button>
                ))}
              </div>

              <div className="timeline-calendar-grid">
                <div className="timeline-day-header">
                  <span>Day {activeDayIndex} 行程流</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Trash2 
                      size={14} 
                      className="text-red-500 hover:scale-110 cursor-pointer" 
                      onClick={() => {
                        if (confirm(`确定要永久删除行程 "${activeTrip.name}" 吗？此操作将自动级联清理主子孙所有数据。`)) {
                          deleteTrip(activeTrip.id);
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Day events loop */}
                {activeTrip.events.filter(e => e.dayIndex === activeDayIndex).length === 0 ? (
                  <div style={{ padding: "32px 0", textAlign: "center", color: "#a39c90", fontSize: 13 }}>
                    🍂 该天暂无规划数据，请输入非结构文本并点击“单日细节”开始填充。
                  </div>
                ) : (
                  activeTrip.events
                    .filter(e => e.dayIndex === activeDayIndex)
                    .map((ev, index, arr) => (
                      <div key={ev.id}>
                        {/* Event Card */}
                        <div 
                          className="poi-card"
                          onClick={() => {
                            // Quick load scenic micro plan trigger
                            if (inputText) {
                              parseMicroPlan(inputText, ev.id, ev.title);
                            }
                          }}
                        >
                          <div className="poi-card-marker-line" />
                          
                          <div className="poi-card-header">
                            <div>
                              <h4 className="poi-title">{ev.title}</h4>
                              {ev.englishTitle && (
                                <span style={{ fontSize: "11px", fontStyle: "italic", color: "var(--muted-clay-text)", display: "block", marginTop: 2 }}>
                                  {ev.englishTitle}
                                </span>
                              )}
                            </div>
                            {ev.time && <span className="poi-time">{ev.time}</span>}
                          </div>

                          {ev.description && (
                            <div className="poi-activities" style={{
                              marginTop: 6,
                              padding: "8px 12px",
                              background: "rgba(217, 155, 38, 0.05)",
                              borderLeft: "2px solid var(--amber-gold)",
                              borderRadius: "4px 10px 10px 4px"
                            }}>
                              <div style={{ fontSize: "10.5px", fontWeight: "700", color: "var(--amber-gold)", textTransform: "uppercase", marginBottom: 3 }}>
                                ✨ 玩什么 (Activities):
                              </div>
                              <p className="poi-desc" style={{ fontSize: "12px", lineHeight: "1.45", color: "var(--muted-clay-text)", margin: 0 }}>
                                {ev.description}
                              </p>
                            </div>
                          )}
                          
                          {/* Inner Micro Points Timeline */}
                          {ev.intraPoints && ev.intraPoints.length > 0 && (
                            <div className="micro-timeline">
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--terracotta-red)", marginBottom: 4 }}>
                                🚶 景点内部游玩路线
                              </div>
                              {ev.intraPoints.map((pt) => (
                                <div key={pt.id} className="micro-point-item">
                                  <span><span className="micro-point-bullet" />{pt.title}</span>
                                  {pt.description && <span style={{ fontSize: 10, color: "#a39c90" }}>{pt.description}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {ev.isHotel && (
                            <div className="poi-card-footer">
                              <span className="hotel-badge">
                                <Hotel size={11} />
                                住宿酒店
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Render Time-Bridge between spots */}
                        {index < arr.length - 1 && (
                          <div className="time-bridge">
                            <div className={`time-bridge-badge ${ev.transitMode}`}>
                              <span>{ev.transitMode === "DRIVING" ? "🚗 自驾" : ev.transitMode === "WALKING" ? "🚶 步行" : "🚌 公交"}</span>
                              <span>至下地</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* Placeholder when no active trip and no sandboxes */}
          {!activeTrip && !macroSandbox && !sandboxBuffer && !sandboxIntraBuffer && (
            <div style={{ padding: "48px 0", textAlign: "center", color: "#a39c90" }}>
              <Compass size={40} strokeWidth={1} style={{ margin: "0 auto 12px", color: "var(--terracotta-red)" }} />
              <p style={{ fontSize: 14, fontWeight: 600 }}>开启 AuroMap 时空对齐</p>
              <p style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>从时空资产库加载历史记录，或者输入一段行程文本点击“整体框架”解析新建一个旅行！</p>
            </div>
          )}
        </div>

        {/* 4. BOTTOM AUDIT OVERLAY (SLIDES FROM BOTTOM WHEN SANDBOX ACTIVE) */}
        <div className={`audit-overlay ${(macroSandbox || sandboxBuffer || sandboxIntraBuffer) ? "active" : ""}`}>
          <div className="audit-header">
            <span className="audit-title">
              {macroSandbox ? "🕵️ 整体框架校核" : sandboxBuffer ? `🕵️ Day ${sandboxBuffer.dayIndex} 行程终审` : "🕵️ 景内微观路线校核"}
            </span>
            <button 
              onClick={clearSandboxes} 
              style={{ background: "transparent", border: "none", fontSize: 12, color: "var(--muted-clay-text)", cursor: "pointer" }}
            >
              取消预览
            </button>
          </div>

          <div className="audit-scrollable">
            {/* 1. Macro Sandbox list */}
            {macroSandbox && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--dark-clay-text)" }}>
                  🗺️ 行程名: {macroSandbox.name} ({macroSandbox.totalDays}天)
                </div>
                <p style={{ fontSize: 12, color: "var(--muted-clay-text)" }}>{macroSandbox.summary}</p>
                {macroSandbox.cities.map((city, idx) => (
                  <div key={idx} style={{ padding: 8, background: "#faf9f5", borderRadius: 8, fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                    <strong>{city.name}</strong>
                    <span>D{city.dayStart} - D{city.dayEnd}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 2. Daily Sandbox list (with decoupled micro transit bridges & bilingual titles) */}
            {sandboxBuffer && sandboxBuffer.events && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sandboxBuffer.events.map((ev, index) => (
                  <div key={index}>
                    {/* Event Card */}
                    <div className="audit-item" style={{ background: "rgba(255, 255, 255, 0.6)", border: "1px solid rgba(109, 102, 90, 0.12)" }}>
                      <div className="audit-item-row">
                        <span className="audit-spot-title" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ fontWeight: 700 }}>
                            {ev.isHotel ? "🏨" : `${index + 1}.`} {ev.title}
                          </span>
                          {ev.englishTitle && (
                            <span style={{ fontSize: "10.5px", fontStyle: "italic", color: "var(--muted-clay-text)", fontWeight: "normal" }}>
                              {ev.englishTitle}
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: 9, color: "#a39c90", textTransform: "uppercase", background: "var(--warm-sand-gray)", padding: "2px 6px", borderRadius: 4 }}>
                          对齐🔒
                        </span>
                      </div>

                      <div className="audit-controls" style={{ marginTop: 4 }}>
                        {/* Time Tune */}
                        <label style={{ fontSize: 11, color: "var(--muted-clay-text)", fontWeight: 600 }}>时间设定:</label>
                        <input
                          type="text"
                          className="audit-input-time"
                          value={ev.time || ""}
                          onChange={(e) => updateSandboxEvent(index, { time: e.target.value })}
                          placeholder="09:00"
                        />
                      </div>
                    </div>

                    {/* Decoupled Transit Selector - Sitting strictly BETWEEN Spot A and Spot B */}
                    {index < sandboxBuffer.events.length - 1 && (
                      <div className="audit-transit-bridge" style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "6px 0",
                        margin: "4px 0 4px 28px",
                        borderLeft: "2px dashed var(--warm-sand-gray)",
                        position: "relative"
                      }}>
                        {/* Bullet link indicator */}
                        <span style={{
                          position: "absolute",
                          left: -4,
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--muted-clay-text)",
                          opacity: 0.4
                        }} />
                        
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-clay-text)", marginLeft: 16 }}>
                          🚗 下站交通:
                        </label>
                        <select
                          className="audit-select-mode"
                          value={ev.transitMode || "DRIVING"}
                          onChange={(e) => updateSandboxEvent(index, { transitMode: e.target.value })}
                          style={{
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: "11px"
                          }}
                        >
                          <option value="DRIVING">🚗 自驾 / 专车</option>
                          <option value="TRANSIT">🚌 公共交通</option>
                          <option value="WALKING">🚶 步行 / 徒步</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 3. Micro Sandbox list (with sorting triggers) */}
            {sandboxIntraBuffer && sandboxIntraBuffer.intraPoints && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted-clay-text)", marginBottom: 4 }}>
                  景点: {sandboxIntraBuffer.parentEventTitle}
                </div>
                {sandboxIntraBuffer.intraPoints.map((pt, index) => (
                  <div key={index} className="audit-item" style={{ padding: "8px 12px" }}>
                    <div className="audit-item-row">
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        {index + 1}. {pt.title}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          disabled={index === 0}
                          onClick={() => moveMicroPoint(index, -1)}
                          style={{ border: "none", background: "none", cursor: "pointer", opacity: index === 0 ? 0.3 : 1 }}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          disabled={index === sandboxIntraBuffer.intraPoints.length - 1}
                          onClick={() => moveMicroPoint(index, 1)}
                          style={{ border: "none", background: "none", cursor: "pointer", opacity: index === sandboxIntraBuffer.intraPoints.length - 1 ? 0.3 : 1 }}
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action solid button */}
          <button
            onClick={handleCommit}
            disabled={isLoading}
            className="commit-button"
          >
            {isLoading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Loader2 size={16} className="animate-spin" />
                正在进行时空级联固化...
              </span>
            ) : (
              <span>
                {macroSandbox ? "📝 COMMIT MAIN PLAN（固化整体计划）" : sandboxBuffer ? "📝 COMMIT DAILY EVENTS（固化单日计划）" : "📝 COMMIT MICRO ROUTE（固化景内微观）"}
              </span>
            )}
          </button>
        </div>
      </section>
    </main>
  );
}
