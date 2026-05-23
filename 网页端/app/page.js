"use client";

import { useEffect, useRef, useState, Fragment } from "react";
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
    setErrorMessage,
    candidatePlaces,
    addCandidatePlace,
    removeCandidatePlace,
    clearCandidatePlaces
  } = useTripStore();

  const [inputText, setInputText] = useState("");
  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [newTripDays, setNewTripDays] = useState(5);
  const [hotelWarning, setHotelWarning] = useState(null);
  const [transitDurations, setTransitDurations] = useState([]);
  
  // Google Places Details & Candidate States
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");

  // References for map initialization
  const mapRef = useRef(null);
  const googleMap = useRef(null);
  const mapMarkers = useRef([]);
  const mapPolylines = useRef([]);
  const directionsService = useRef(null);
  const placesService = useRef(null);

  // 🆕 Export Helpers
  const handleExportPDF = () => {
    window.print();
  };

  const handleExportDailyRoute = () => {
    const dayEvents = activeTrip?.events.filter(e => e.dayIndex === activeDayIndex && e.latitude !== 0 && e.longitude !== 0) || [];
    if (dayEvents.length === 0) {
      alert("⚠️ 该天暂无有效的坐标定位点，无法生成 Google 地图路线。");
      return;
    }

    const origin = dayEvents[0];
    const destination = dayEvents[dayEvents.length - 1];
    
    let link = `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}`;
    
    if (dayEvents.length > 2) {
      const waypoints = dayEvents.slice(1, -1).map(ev => `${ev.latitude},${ev.longitude}`).join("|");
      link += `&waypoints=${encodeURIComponent(waypoints)}`;
    }
    
    let travelmode = "driving";
    if (origin.transitMode === "WALKING") travelmode = "walking";
    else if (origin.transitMode === "TRANSIT") travelmode = "transit";
    
    link += `&travelmode=${travelmode}`;
    window.open(link, "_blank");
  };

  const handleExportKML = () => {
    if (!activeTrip || !activeTrip.events) {
      alert("⚠️ 暂无可导出的行程数据。");
      return;
    }
    
    let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${activeTrip.name || "AuroMap 行程"}</name>
    <description>由 AuroMap Planner 高定温暖沙旅行规划手帐导出 (KML 格式可直接导入 Google My Maps / 我的地图)</description>
`;

    const eventsByDay = {};
    activeTrip.events.forEach(ev => {
      if (!eventsByDay[ev.dayIndex]) {
        eventsByDay[ev.dayIndex] = [];
      }
      eventsByDay[ev.dayIndex].push(ev);
    });

    Object.keys(eventsByDay).sort((a,b) => a-b).forEach(day => {
      kmlContent += `    <Folder>
      <name>Day ${day}</name>
`;
      eventsByDay[day].forEach((ev, idx) => {
        if (ev.latitude === 0 && ev.longitude === 0) return;
        
        kmlContent += `      <Placemark>
        <name>D${day} - ${idx + 1}. ${ev.title}</name>
        <description><![CDATA[
          🕒 时间: ${ev.time || "全天"}<br/>
          🌍 英文名称: ${ev.englishTitle || "暂无"}<br/>
          ✨ 游玩攻略: ${ev.description || "无"}<br/>
          🎫 票务预约: ${ev.bookingRequired ? `需提前订票 (价格: ${ev.ticketPrice || "未知"}, 场次: ${ev.bookingSession || "无"}, 提前量: ${ev.advanceBookingTime || "无"})` : "免票/现场购票"}<br/>
          🚗 下一站交通: ${ev.transitMode || "DRIVING"} ${ev.transitNotes ? `(注意: ${ev.transitNotes})` : ""}
        ]]></description>
        <Point>
          <coordinates>${ev.longitude},${ev.latitude},0</coordinates>
        </Point>
      </Placemark>
`;
      });
      kmlContent += `    </Folder>\n`;
    });

    kmlContent += `  </Document>
</kml>`;

    const blob = new Blob([kmlContent], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTrip.name || "AuroMap_Trip"}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to fetch full authentic Google Places details
  const getPlaceDetails = (placeId) => {
    if (!placesService.current) {
      if (window.google && window.google.maps && window.google.maps.places) {
        placesService.current = new window.google.maps.places.PlacesService(googleMap.current);
      } else {
        console.warn("[Places Details] Google Places library is not loaded.");
        alert("⚠️ 谷歌 Places 库尚未加载完成，请稍候再试。");
        return;
      }
    }
    
    console.log("[Places Details] Triggering query for Place ID:", placeId);
    
    placesService.current.getDetails(
      {
        placeId: placeId,
        fields: [
          "name",
          "rating",
          "user_ratings_total",
          "formatted_address",
          "formatted_phone_number",
          "website",
          "opening_hours",
          "utc_offset_minutes", // 🆕 Required for isOpen() calculation in Google API!
          "photos",
          "url",
          "geometry",
          "editorial_summary", // 🆕 Added: brief editorial summary introduction (legacy name format)
          "reviews"          // 🆕 Added: user reviews list
        ]
      },
      (place, status) => {
        try {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
            console.log("[Google Places details success]:", place);
            
            let photoUrl = null;
            if (place.photos && place.photos.length > 0 && typeof place.photos[0].getUrl === "function") {
              photoUrl = place.photos[0].getUrl({ maxWidth: 500, maxHeight: 300 });
            }

            let openStatus = "";
            if (place.opening_hours && typeof place.opening_hours.isOpen === "function") {
              try {
                openStatus = place.opening_hours.isOpen() ? "🟢 营业中" : "🔴 已打烊";
              } catch (e) {
                console.warn("[Places Details] opening_hours.isOpen call failed:", e);
                openStatus = "⚡ 营业状态（需点击实景链接查看）";
              }
            }

            let lat = 0;
            let lng = 0;
            if (place.geometry && place.geometry.location) {
              lat = typeof place.geometry.location.lat === "function" ? place.geometry.location.lat() : place.geometry.location.lat;
              lng = typeof place.geometry.location.lng === "function" ? place.geometry.location.lng() : place.geometry.location.lng;
            }

            // Extract editorial summary safely supporting both formats
            let summary = "";
            const rawSummary = place.editorial_summary || place.editorialSummary;
            if (rawSummary) {
              summary = typeof rawSummary === "string"
                ? rawSummary
                : (rawSummary.overview || "");
            }

            // Extract top 3 reviews
            let reviewList = [];
            if (place.reviews && Array.isArray(place.reviews)) {
              reviewList = place.reviews.slice(0, 3).map(rev => ({
                author: rev.author_name || "匿名游客",
                rating: rev.rating || 5,
                time: rev.relative_time_description || "",
                text: rev.text || ""
              }));
            }

            setSelectedPlace({
              placeId: placeId,
              name: place.name || "未知地点",
              rating: place.rating || null,
              ratingsCount: place.user_ratings_total || 0,
              address: place.formatted_address || "暂无地址记录",
              phone: place.formatted_phone_number || "暂无电话记录",
              website: place.website || null,
              openStatus: openStatus,
              photoUrl: photoUrl,
              googleUrl: place.url || null,
              latitude: lat,
              longitude: lng,
              summary: summary,
              reviews: reviewList
            });
          } else {
            console.error("[Google Places details failed]:", status);
            alert(`⚠️ Google Maps 详情服务返回错误: "${status}"。请确认您的 Google Cloud 控制台已启用 "Places API" 服务。`);
          }
        } catch (callbackErr) {
          console.error("[Places details callback crashed]:", callbackErr);
          alert(`⚠️ 解析地点详情时发生内部错误: ${callbackErr.message}。请打开控制台查看。`);
        }
      }
    );
  };

  // Google Static Maps API Route Screenshot Generator
  const getStaticMapUrl = (dayEvents) => {
    if (!googleApiKey) return null;
    const validEvents = dayEvents.filter(ev => ev.latitude && ev.longitude && ev.latitude !== 0 && ev.longitude !== 0);
    if (validEvents.length === 0) return null;

    // 1. Build markers with Terracotta red color & numeric labels
    const markers = validEvents.map((ev, idx) => {
      const label = idx + 1;
      return `markers=color:0xD35400|label:${label}|${ev.latitude},${ev.longitude}`;
    }).join("&");

    // 2. Build path connection between events in travel sequence order
    const pathCoords = validEvents.map(ev => `${ev.latitude},${ev.longitude}`).join("|");
    const path = validEvents.length > 1 ? `&path=color:0xD35400|weight:3|${pathCoords}` : "";

    // 3. Apply custom Warm Linen Hand-Ledger luxury styling to Google Maps
    const styles = [
      "style=element:geometry|color:0xebe8e1",
      "style=feature:landscape.natural|element:geometry|color:0xe6e2da",
      "style=feature:poi|element:geometry|color:0xe0dcce",
      "style=feature:poi.business|element:labels|visibility:off",
      "style=feature:transit|element:geometry|color:0xe6e2da",
      "style=feature:transit|element:labels|visibility:off",
      "style=feature:road|element:geometry|color:0xffffff",
      "style=feature:road|element:labels.text.fill|color:0x767676",
      "style=feature:water|element:geometry|color:0xb9d3c2"
    ].join("&");

    return `https://maps.googleapis.com/maps/api/staticmap?size=700x350&scale=2&maptype=roadmap&${markers}${path}&${styles}&key=${googleApiKey}`;
  };

  // Helper to compile natural language prompt and auto-copy to clipboard
  const handleGeneratePrompt = () => {
    // Prioritize preview sandbox buffer events over committed activeTrip events!
    let dayEvents = [];
    if (sandboxBuffer && sandboxBuffer.events && sandboxBuffer.events.length > 0) {
      dayEvents = sandboxBuffer.events;
    } else {
      dayEvents = activeTrip?.events.filter(e => e.dayIndex === activeDayIndex) || [];
    }
    
    let currentItineraryText = "";
    if (dayEvents.length === 0) {
      currentItineraryText = "（当前日期暂无规划行程）";
    } else {
      currentItineraryText = dayEvents.map((ev, idx) => {
        const timeStr = ev.time ? `[${ev.time}]` : "";
        const titleStr = ev.title + (ev.englishTitle ? ` (${ev.englishTitle})` : "");
        const descStr = ev.description ? `游玩描述: ${ev.description}` : "";
        return `${idx + 1}. ${timeStr} ${titleStr} ${descStr}`;
      }).join("\n");
    }

    const candidatesText = candidatePlaces.map((place, idx) => {
      const addrStr = place.address ? `，地址位于: ${place.address}` : "";
      const ratingStr = place.rating ? `，谷歌评分: ${place.rating}` : "";
      return `- 【${place.name}】${addrStr}${ratingStr}`;
    }).join("\n");

    const compiledPrompt = `我当前的第 ${activeDayIndex} 天行程流是：
${currentItineraryText}

我在地图上探索并收集了以下这几个备选地点，想加入到今天的行程中：
${candidatesText}

请帮我把这些备选景点合理融入今天的行程中，重新排列最顺路的先后顺序，并智能编排推荐最合理的交通方式！`;

    setPromptText(compiledPrompt);
    setShowPromptModal(true);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(compiledPrompt)
        .then(() => {
          console.log("[Clipboard success]");
        })
        .catch(err => {
          console.error("Failed to copy prompt to clipboard:", err);
        });
    }
  };

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
        setGoogleApiKey(key);

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
          { featureType: "poi.business", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "poi.medical", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "poi.government", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "poi.school", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "poi.place_of_worship", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "poi.attraction", elementType: "labels", stylers: [{ visibility: "on" }] },
          { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "on" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#f9f8f6" }] },
          { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e6decb" }] },
          { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d7cda9" }] },
          { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e6e2da" }] },
          { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
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

        // Bind Google Native POI Click Event with diagnosis logging
        mapInstance.addListener("click", (e) => {
          console.log("[Map Click Event] Clicked coordinates:", e.latLng ? `${e.latLng.lat()}, ${e.latLng.lng()}` : "unknown");
          
          if (e.placeId) {
            console.log("[Map Click Event] POI detected! Place ID:", e.placeId);
            e.stop(); // Stop Google Maps default overlay
            getPlaceDetails(e.placeId);
          } else {
            console.log("[Map Click Event] Regular map background clicked. Resetting selection.");
            setSelectedPlace(null);
          }
        });

        console.log("[AuroMap] Google Maps successfully initialized!");
      } catch (err) {
        console.error("[AuroMap] Error loading Google Maps:", err);
        alert(`⚠️ 地图初始化失败: ${err.message}。如果是在热重载过程中发生，请尝试手动刷新网页(F5)。`);
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
      const renderedCoords = new Set();

      macroSandbox.cities.forEach((city, index) => {
        if (city.latitude === 0 && city.longitude === 0) return;

        const pos = { lat: city.latitude, lng: city.longitude };
        cityPathCoords.push(pos);
        bounds.extend(pos);

        // De-duplicate markers at the same coordinates to prevent blurry blurry blurry font overlays
        const coordKey = `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}`;
        if (renderedCoords.has(coordKey)) return;
        renderedCoords.add(coordKey);

        // Marker: Bronze double ring marker for Macro city with elegant floating Outfit label
        const marker = new window.google.maps.Marker({
          position: pos,
          map: gMap,
          title: city.englishName ? `${city.name} (${city.englishName})` : city.name,
          label: {
            text: city.name, // Only show Chinese title to keep the map clean and beautiful
            color: "#2e2b25", // deep bronze clay
            fontSize: "11px",
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
            labelOrigin: new window.google.maps.Point(0, -1.8) // Perfect vertical offset for single line
          }
        });
        
        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div class="custom-infowindow"><h4>${city.name}</h4><p>第 ${city.dayStart} 天 - 第 ${city.dayEnd} 天</p><p>${city.description || ""}</p></div>`
        });

        marker.addListener("click", () => infoWindow.open(gMap, marker));
        mapMarkers.current.push(marker);
      });

      // Arc/Wide dashed line connecting macro centers (Macro Arc Route) with directional arrows
      const macroPolyline = new window.google.maps.Polyline({
        path: cityPathCoords,
        geodesic: true,
        map: gMap,
        strokeColor: "#d99b26",
        strokeOpacity: 0,
        icons: [
          // Dashes
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeColor: "#d99b26",
              strokeOpacity: 0.5,
              scale: 2
            },
            offset: "0",
            repeat: "12px"
          },
          // Directional arrows
          {
            icon: {
              path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              fillColor: "#d99b26",
              fillOpacity: 0.9,
              strokeColor: "#ffffff",
              strokeWeight: 1,
              scale: 2.5
            },
            offset: "5%",
            repeat: "100px"
          }
        ],
        strokeWeight: 4
      });

      mapPolylines.current.push(macroPolyline);
      
      if (cityPathCoords.length === 1) {
        gMap.setCenter(cityPathCoords[0]);
        gMap.setZoom(8); // Perfect regional view for single city
      } else if (cityPathCoords.length > 1) {
        gMap.fitBounds(bounds);
        // Using idle event ensures bounds are fully calculated before capping zoom
        const listener = gMap.addListener("idle", () => {
          if (gMap.getZoom() > 8) {
            gMap.setZoom(8);
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

    // Reset local durations array, pre-filling with already saved values if available and not in preview
    const durations = events.slice(0, -1).map(ev => (!isPreview && ev.transitDuration) ? ev.transitDuration : "");
    setTransitDurations(durations);

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

      // Auxiliary Marker: Floats the clean Chinese name above the shield badge (Dual-Marker Overlay Hack!)
      const labelMarker = new window.google.maps.Marker({
        position: pos,
        map: gMap,
        label: {
          text: ev.title, // Only show Chinese title to keep the map clean and beautiful
          color: "#2e2b25", // deep bronze clay
          fontSize: "10px", // neat and readable
          fontWeight: "700",
          fontFamily: "var(--font-outfit)"
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillOpacity: 0,
          strokeOpacity: 0,
          scale: 10, // Increased scale from 1 to 10!
          labelOrigin: new window.google.maps.Point(0, -2.8) // Shifts label 28px above the shield marker!
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
      } else if (mode === "FLIGHT") {
        lineColor = "#3182ce"; // flight color: Deep Blue
      } else if (mode === "TRAIN") {
        lineColor = "#805ad5"; // train color: Royal Purple
      }

      // If we are NOT in preview mode AND we have a saved transit duration,
      // we bypass Directions API entirely and render a beautiful direct line!
      if (!isPreview && origin.transitDuration) {
        // 1. Draw a background glowing path
        const backgroundPolyline = new window.google.maps.Polyline({
          path: [originPos, destPos],
          geodesic: true,
          map: gMap,
          strokeColor: lineColor,
          strokeOpacity: 0.15,
          strokeWeight: 6
        });
        mapPolylines.current.push(backgroundPolyline);

        // 2. Draw the foreground path
        const directPolyline = new window.google.maps.Polyline({
          path: [originPos, destPos],
          geodesic: true,
          map: gMap,
          strokeColor: lineColor,
          strokeOpacity: 0.85,
          strokeWeight: 4.5,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeColor: lineColor, strokeOpacity: 0.7, scale: 2.5 },
              offset: "0",
              repeat: "12px"
            },
            {
              icon: {
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                fillColor: lineColor,
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 1,
                scale: 2.2
              },
              offset: "50%",
              repeat: "0"
            }
          ]
        });
        mapPolylines.current.push(directPolyline);

        // Update durations array
        durations[i] = origin.transitDuration;
        setTransitDurations([...durations]);
        continue;
      }

      // If flight or train, draw elegant geodesic arc line with midpoint arrow, and bypass Directions API!
      if (mode === "FLIGHT" || mode === "TRAIN") {
        // 1. Draw a background glowing path
        const backgroundPolyline = new window.google.maps.Polyline({
          path: [originPos, destPos],
          geodesic: true,
          map: gMap,
          strokeColor: lineColor,
          strokeOpacity: 0.15,
          strokeWeight: 7
        });
        mapPolylines.current.push(backgroundPolyline);

        // 2. Draw the foreground geodesic path with standard dash + middle arrow!
        const geodesicPolyline = new window.google.maps.Polyline({
          path: [originPos, destPos],
          geodesic: true,
          map: gMap,
          strokeColor: lineColor,
          strokeOpacity: 0.85,
          strokeWeight: 4,
          icons: [
            // Dash path
            {
              icon: { path: "M 0,-1 0,1", strokeColor: lineColor, strokeOpacity: 0.7, scale: 2 },
              offset: "0",
              repeat: "12px"
            },
            // Directional Arrow in the middle
            {
              icon: {
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                fillColor: lineColor,
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 1,
                scale: 2.2
              },
              offset: "50%",
              repeat: "0"
            }
          ]
        });
        mapPolylines.current.push(geodesicPolyline);

        // Geodesic distance based duration calculation
        const distance = getHaversineDistance(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
        if (mode === "FLIGHT") {
          const hours = Math.max(1, Math.round(distance / 700 + 1)); // 700 km/h flight speed + 1 hr buffer
          durations[i] = `${hours}小时`;
        } else {
          const hours = Math.max(1, Math.round(distance / 200 + 0.5)); // 200 km/h train speed
          durations[i] = `${hours}小时`;
        }
        setTransitDurations([...durations]);
        continue;
      }

      const request = {
        origin: originPos,
        destination: destPos,
        travelMode: googleMode
      };

      directionsService.current.route(request, (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          const path = result.routes[0].overview_path;

          // 1. Draw background glowing path for high clarity
          const bgPolyline = new window.google.maps.Polyline({
            path: path,
            geodesic: true,
            map: gMap,
            strokeColor: lineColor,
            strokeOpacity: 0.15,
            strokeWeight: isPreview ? 7 : 8
          });
          mapPolylines.current.push(bgPolyline);

          // 2. Draw foreground path
          let polyline;
          if (isPreview) {
            // Dash polyline for preview (thick and highly visible!)
            polyline = new window.google.maps.Polyline({
              path: path,
              geodesic: true,
              map: gMap,
              strokeColor: lineColor,
              strokeOpacity: 0,
              icons: [
                {
                  icon: { path: "M 0,-1 0,1", strokeColor: lineColor, strokeOpacity: 0.9, scale: 3 },
                  offset: "0",
                  repeat: "12px"
                },
                {
                  icon: {
                    path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    fillColor: lineColor,
                    fillOpacity: 0.9,
                    strokeColor: "#ffffff",
                    strokeWeight: 1,
                    scale: 2.2
                  },
                  offset: "20px",
                  repeat: "80px"
                }
              ],
              strokeWeight: 4
            });
          } else {
            // Solid polyline with directions arrows for committed plan
            polyline = new window.google.maps.Polyline({
              path: path,
              geodesic: true,
              map: gMap,
              strokeColor: lineColor,
              strokeOpacity: 0.95,
              strokeWeight: 5.5,
              icons: [{
                icon: {
                  path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  fillColor: lineColor,
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 1,
                  scale: 2.3
                },
                offset: "30px",
                repeat: "90px"
              }]
            });
          }
          mapPolylines.current.push(polyline);

          // Extract real-time duration and update React state
          const durationText = result.routes[0].legs[0].duration.text;
          let durationChinese = durationText
            .replace(/mins?/g, "分钟")
            .replace(/hours?/g, "小时")
            .replace(/\s+/g, "");
          durations[i] = durationChinese;
          setTransitDurations([...durations]);
        } else {
          console.warn(`[Directions Service] Route request failed: ${status}. Fallback to geodesic line.`);
          
          // Fallback background glow
          const bgPolyline = new window.google.maps.Polyline({
            path: [originPos, destPos],
            map: gMap,
            strokeColor: lineColor,
            strokeOpacity: 0.12,
            strokeWeight: 6
          });
          mapPolylines.current.push(bgPolyline);

          // Fallback to straight line if directions route fails
          const fallbackPolyline = new window.google.maps.Polyline({
            path: [originPos, destPos],
            map: gMap,
            strokeColor: lineColor,
            strokeOpacity: isPreview ? 0.5 : 0.85,
            strokeWeight: isPreview ? 3.5 : 4.5,
            icons: [
              {
                icon: { path: "M 0,-1 0,1", strokeColor: lineColor, strokeOpacity: 0.8, scale: 2.5 },
                offset: "0",
                repeat: "12px"
              },
              {
                icon: {
                  path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  fillColor: lineColor,
                  fillOpacity: 0.9,
                  strokeColor: "#ffffff",
                  strokeWeight: 1,
                  scale: 2
                },
                offset: "50%",
                repeat: "0"
              }
            ]
          });
          mapPolylines.current.push(fallbackPolyline);

          // Estimate fallback duration based on distance
          const distance = getHaversineDistance(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
          let fallbackMinutes = 15;
          if (mode === "WALKING") {
            fallbackMinutes = Math.max(5, Math.round(distance * 15));
          } else {
            fallbackMinutes = Math.max(5, Math.round(distance * 1.5 + 5));
          }
          durations[i] = fallbackMinutes >= 60 
            ? `${Math.round(fallbackMinutes / 60)}小时${fallbackMinutes % 60}分钟` 
            : `${fallbackMinutes}分钟`;
          setTransitDurations([...durations]);
        }
      });
    }

    const validCoords = events.filter(ev => ev.latitude !== 0 && ev.longitude !== 0);
    if (validCoords.length === 1) {
      const singlePos = { lat: validCoords[0].latitude, lng: validCoords[0].longitude };
      gMap.setCenter(singlePos);
      gMap.setZoom(14); // Perfect standard city zoom level for single spot
    } else if (validCoords.length > 1) {
      gMap.fitBounds(bounds);
      const listener = gMap.addListener("idle", () => {
        if (gMap.getZoom() > 16) gMap.setZoom(16);
        gMap.setTilt(0); // Flat view for daily overview
        window.google.maps.event.removeListener(listener);
      });
    }
  }

  // Handle Commit button clicks
  const handleCommit = async () => {
    if (macroSandbox) {
      await commitMacroPlan();
      setInputText("");
    } else if (sandboxBuffer) {
      // Decouple transitDurations and save them to each event before committing
      const eventsWithDurations = sandboxBuffer.events.map((ev, index) => ({
        ...ev,
        transitDuration: transitDurations[index] || null
      }));
      await commitDailyPlan(eventsWithDurations);
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
              {/* Luxury Export Controls */}
              <div className="export-buttons-row">
                <button onClick={handleExportPDF} className="export-btn">
                  📖 打印/导出 PDF
                </button>
                <button onClick={handleExportDailyRoute} className="export-btn">
                  🚗 当日行程 (Google地图)
                </button>
                <button onClick={handleExportKML} className="export-btn">
                  🗺️ 整体行程 (我的地图 KML)
                </button>
              </div>

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
                      fontSize: "14.5px",
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
                              {ev.address && (
                                <span style={{ fontSize: "10.5px", color: "#a39c90", display: "flex", alignItems: "center", gap: "3px", marginTop: "4px" }}>
                                  📍 {ev.address}
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
                          
                           {/* Booking Details Capsule */}
                          {ev.bookingRequired && (
                            <div className="ticket-capsule">
                              <div className="ticket-badge-row">
                                <span className="ticket-badge">🏷️ 需提前订票</span>
                                {ev.advanceBookingTime && (
                                  <span className="ticket-time-badge">⏳ {ev.advanceBookingTime}</span>
                                )}
                              </div>
                              <div className="ticket-grid">
                                {ev.bookingSession && (
                                  <div className="ticket-grid-item">
                                    <span className="label">预订场次:</span>
                                    <span className="value">{ev.bookingSession}</span>
                                  </div>
                                )}
                                {ev.ticketPrice && (
                                  <div className="ticket-grid-item">
                                    <span className="label">门票价格:</span>
                                    <span className="value">{ev.ticketPrice}</span>
                                  </div>
                                )}
                              </div>
                              {ev.bookingUrl && (
                                <a 
                                  href={ev.bookingUrl.startsWith("http") ? ev.bookingUrl : `https://${ev.bookingUrl}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="ticket-action-btn"
                                >
                                  前往官方购票 ↗
                                </a>
                              )}
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
                              <span>
                                {ev.transitMode === "DRIVING" ? "🚗 自驾" : ev.transitMode === "WALKING" ? "🚶 步行" : ev.transitMode === "TRANSIT" ? "🚌 公交" : ev.transitMode === "FLIGHT" ? "✈️ 飞机" : ev.transitMode === "TRAIN" ? "🚄 火车" : "🚗 交通"}
                                {transitDurations[index] ? ` (约 ${transitDurations[index]})` : ""}
                              </span>
                              <span>至下一地</span>
                            </div>
                            
                            {/* Transit Precautions Safety Alert Bubble */}
                            {ev.transitNotes && (
                              <div className="transit-alert-bubble">
                                <span className="alert-icon">⚠️</span>
                                <span className="alert-text">{ev.transitNotes}</span>
                              </div>
                            )}
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

                      {/* Display "玩什么" (description) in the Sandbox card! */}
                      {ev.description && (
                        <p style={{
                          fontSize: "11px",
                          color: "var(--muted-clay-text)",
                          marginTop: 6,
                          lineHeight: "1.4",
                          background: "rgba(255, 255, 255, 0.4)",
                          padding: "6px 10px",
                          borderRadius: 6,
                          borderLeft: "2px solid var(--terracotta-red)",
                          textAlign: "left"
                        }}>
                          💡 <strong>游玩攻略:</strong> {ev.description}
                        </p>
                      )}

                      <div className="audit-controls" style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Time Tune & Booking Required Checkbox */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: 11, color: "var(--muted-clay-text)", fontWeight: 600 }}>时间设定:</label>
                          <input
                            type="text"
                            className="audit-input-time"
                            value={ev.time || ""}
                            onChange={(e) => updateSandboxEvent(index, { time: e.target.value })}
                            placeholder="09:00"
                            style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11 }}
                          />

                          <label style={{ fontSize: 11, color: "var(--muted-clay-text)", fontWeight: 600, marginLeft: 16, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={ev.bookingRequired || false}
                              onChange={(e) => updateSandboxEvent(index, { bookingRequired: e.target.checked })}
                              style={{ cursor: "pointer" }}
                            />
                            🎫 需要订票
                          </label>
                        </div>

                        {/* Address Input */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: 11, color: "var(--muted-clay-text)", fontWeight: 600, flexShrink: 0 }}>地址信息:</label>
                          <input
                            type="text"
                            value={ev.address || ""}
                            onChange={(e) => updateSandboxEvent(index, { address: e.target.value })}
                            placeholder="景点详细地址..."
                            style={{
                              flex: 1,
                              padding: "3px 8px",
                              borderRadius: 6,
                              fontSize: "11px",
                              border: "1px solid rgba(109, 102, 90, 0.15)",
                              background: "#ffffff",
                              outline: "none"
                            }}
                          />
                        </div>

                        {/* Booking Detail Grid Forms */}
                        {ev.bookingRequired && (
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 6,
                            background: "rgba(230, 226, 218, 0.25)",
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(109, 102, 90, 0.08)"
                          }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <label style={{ fontSize: 9.5, color: "var(--muted-clay-text)", fontWeight: 700 }}>预订场次:</label>
                              <input
                                type="text"
                                value={ev.bookingSession || ""}
                                onChange={(e) => updateSandboxEvent(index, { bookingSession: e.target.value })}
                                placeholder="如: 上午场"
                                style={{ padding: "3px 6px", borderRadius: 4, fontSize: 10, border: "1px solid rgba(109, 102, 90, 0.15)", background: "#ffffff" }}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <label style={{ fontSize: 9.5, color: "var(--muted-clay-text)", fontWeight: 700 }}>门票价格:</label>
                              <input
                                type="text"
                                value={ev.ticketPrice || ""}
                                onChange={(e) => updateSandboxEvent(index, { ticketPrice: e.target.value })}
                                placeholder="如: €25"
                                style={{ padding: "3px 6px", borderRadius: 4, fontSize: 10, border: "1px solid rgba(109, 102, 90, 0.15)", background: "#ffffff" }}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <label style={{ fontSize: 9.5, color: "var(--muted-clay-text)", fontWeight: 700 }}>提前多久订:</label>
                              <input
                                type="text"
                                value={ev.advanceBookingTime || ""}
                                onChange={(e) => updateSandboxEvent(index, { advanceBookingTime: e.target.value })}
                                placeholder="如: 提前30天"
                                style={{ padding: "3px 6px", borderRadius: 4, fontSize: 10, border: "1px solid rgba(109, 102, 90, 0.15)", background: "#ffffff" }}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <label style={{ fontSize: 9.5, color: "var(--muted-clay-text)", fontWeight: 700 }}>购票官网:</label>
                              <input
                                type="text"
                                value={ev.bookingUrl || ""}
                                onChange={(e) => updateSandboxEvent(index, { bookingUrl: e.target.value })}
                                placeholder="如: www.example.com"
                                style={{ padding: "3px 6px", borderRadius: 4, fontSize: 10, border: "1px solid rgba(109, 102, 90, 0.15)", background: "#ffffff" }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Decoupled Transit Selector - Sitting strictly BETWEEN Spot A and Spot B */}
                    {index < sandboxBuffer.events.length - 1 && (
                      <div className="audit-transit-bridge" style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "6px 0",
                        margin: "4px 0 4px 28px",
                        borderLeft: "2px dashed var(--warm-sand-gray)",
                        position: "relative"
                      }}>
                        {/* Bullet link indicator */}
                        <span style={{
                          position: "absolute",
                          left: -4,
                          top: 10,
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--muted-clay-text)",
                          opacity: 0.4
                        }} />
                        
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-clay-text)", marginLeft: 16 }}>
                            🚗 下站交通 {transitDurations[index] ? `(约 ${transitDurations[index]})` : ""}:
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
                            <option value="FLIGHT">✈️ 飞机</option>
                            <option value="TRAIN">🚄 火车</option>
                          </select>
                        </div>

                        {/* Transit Precautions Safety Warning Input */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", paddingLeft: 16 }}>
                          <label style={{ fontSize: 10, color: "var(--muted-clay-text)", fontWeight: 700, flexShrink: 0 }}>⚠️ 交通注意:</label>
                          <input
                            type="text"
                            value={ev.transitNotes || ""}
                            onChange={(e) => updateSandboxEvent(index, { transitNotes: e.target.value })}
                            placeholder="如: 老城区限行、周日班次减少等..."
                            style={{
                              flex: 1,
                              padding: "3px 8px",
                              borderRadius: 6,
                              fontSize: "10px",
                              border: "1px solid rgba(109, 102, 90, 0.15)",
                              background: "rgba(255, 255, 255, 0.5)",
                              maxWidth: "320px",
                              outline: "none"
                            }}
                          />
                        </div>
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

      {/* 5. Floating Right Canvas Inspiration and Details Console */}
      {(selectedPlace || candidatePlaces.length > 0) && (
        <section className="auromap-right-console">
          {/* HEADER */}
          <div className="right-console-header">
            <span className="right-console-title">⭐ 灵感口袋与实景详情</span>
            <button 
              onClick={() => setSelectedPlace(null)}
              className="right-console-close"
            >
              ✕ 关闭
            </button>
          </div>

          <div className="right-console-workspace">
            {/* GOOGLE PLACES DETAIL CARD */}
            {selectedPlace && (
              <div className="google-details-card">
                {selectedPlace.photoUrl && (
                  <div className="details-hero-img" style={{ backgroundImage: `url(${selectedPlace.photoUrl})` }} />
                )}
                
                <div className="details-body">
                  <h3 className="details-title">{selectedPlace.name}</h3>
                  
                  {selectedPlace.rating && (
                    <div className="details-rating">
                      <span className="stars">{"★".repeat(Math.round(selectedPlace.rating)) + "☆".repeat(5 - Math.round(selectedPlace.rating))}</span>
                      <span className="rating-text">{selectedPlace.rating} ({selectedPlace.ratingsCount} 条评分)</span>
                    </div>
                  )}
                  
                  {/* EDITORIAL SUMMARY / INTRO */}
                  {selectedPlace.summary && (
                    <p className="details-summary-text">
                      💡 <strong>简介:</strong> {selectedPlace.summary}
                    </p>
                  )}

                  <div className="details-meta-list">
                    {selectedPlace.openStatus && (
                      <div className="details-meta-item">
                        <span className="meta-label">状态:</span>
                        <span className="meta-value" style={{ fontWeight: "bold" }}>{selectedPlace.openStatus}</span>
                      </div>
                    )}
                    
                    {selectedPlace.address && (
                      <div className="details-meta-item">
                        <span className="meta-label">地址:</span>
                        <span className="meta-value">{selectedPlace.address}</span>
                      </div>
                    )}
                    
                    {selectedPlace.phone && (
                      <div className="details-meta-item">
                        <span className="meta-label">电话:</span>
                        <span className="meta-value">{selectedPlace.phone}</span>
                      </div>
                    )}
                    
                    {selectedPlace.website && (
                      <div className="details-meta-item">
                        <span className="meta-label">官网:</span>
                        <a href={selectedPlace.website} target="_blank" rel="noreferrer" className="meta-value link">
                          {selectedPlace.website}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Add to candidate button */}
                  <button 
                    onClick={() => {
                      addCandidatePlace(selectedPlace);
                      alert(`已成功将“${selectedPlace.name}”加入备选灵感口袋！`);
                    }}
                    className="add-to-candidate-btn"
                  >
                    ➕ 收藏至备选灵感口袋
                  </button>

                  {/* USER REVIEWS (TOP 3) */}
                  {selectedPlace.reviews && selectedPlace.reviews.length > 0 && (
                    <div className="details-reviews-section">
                      <h4 className="reviews-section-title">💬 游客评价 (精选 3 条)</h4>
                      <div className="details-reviews-list">
                        {selectedPlace.reviews.map((rev, idx) => (
                          <div key={idx} className="review-item">
                            <div className="review-item-header">
                              <span className="review-author">{rev.author}</span>
                              <span className="review-rating">{"★".repeat(Math.round(rev.rating))}</span>
                              <span className="review-time">{rev.time}</span>
                            </div>
                            <p className="review-text">{rev.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CANDIDATE PLACES LIST */}
            {candidatePlaces.length > 0 && (
              <div className="candidate-section">
                <div className="candidate-section-header">
                  <span>⭐ 备选灵感清单 ({candidatePlaces.length})</span>
                  <button onClick={clearCandidatePlaces} className="clear-candidates-link">清空</button>
                </div>

                <div className="candidate-list">
                  {candidatePlaces.map((place) => (
                    <div key={place.placeId} className="candidate-item-card">
                      <div className="candidate-item-header">
                        <span className="candidate-item-title">{place.name}</span>
                        <button 
                          onClick={() => removeCandidatePlace(place.placeId)}
                          className="remove-candidate-btn"
                        >
                          ✕
                        </button>
                      </div>
                      {place.address && <p className="candidate-item-address">{place.address}</p>}
                    </div>
                  ))}
                </div>

                {/* Generate fusion prompt button */}
                <button 
                  onClick={handleGeneratePrompt}
                  className="generate-prompt-btn"
                >
                  🔮 生成 AI 融合 Prompt
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 6. AESTHETIC PROMPT COPY MODAL */}
      {showPromptModal && (
        <div className="prompt-modal-backdrop" onClick={() => setShowPromptModal(false)}>
          <div className="prompt-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-modal-header">
              <span>🔮 时空对齐 AI 融合 Prompt 已生成并复制</span>
              <button onClick={() => setShowPromptModal(false)} className="close-btn">✕</button>
            </div>
            <div className="prompt-modal-body">
              <p className="prompt-modal-notice">✨ 指令已成功自动复制到您的系统剪贴板！您可以直接粘贴到网页版 AI 对话框中进行交互。</p>
              <textarea 
                className="prompt-modal-textarea" 
                readOnly 
                value={promptText} 
                onClick={(e) => e.target.select()}
              />
            </div>
          </div>
        </div>
      )}


      {/* 7. HIDDEN PRINT ONLY MULTI-PAGE MANUAL LUXX LEDGER */}
      <div className="auromap-print-container">
        <header className="print-header">
          <h1>📖 {activeTrip?.name || "AuroMap 旅行规划路书"}</h1>
          <p>📅 全程天数：{activeTrip?.totalDays || 0} 天 | 探索者专属手账系统</p>
        </header>

        {activeTrip?.events && (
          <div className="print-days-list">
            {Array.from({ length: activeTrip.totalDays }).map((_, dIdx) => {
              const day = dIdx + 1;
              const dayEvents = activeTrip.events.filter(e => e.dayIndex === day);
              if (dayEvents.length === 0) return null;
              
              return (
                <section key={day} className="print-day-section">
                  <h2 className="print-day-title">🗓️ Day {day} 行程安排</h2>
                  
                  {/* Google Static Route Map Screenshot for Day */}
                  {(() => {
                    const staticMapUrl = getStaticMapUrl(dayEvents);
                    if (!staticMapUrl) return null;
                    return (
                      <div className="print-route-map-container">
                        <img src={staticMapUrl} alt={`Day ${day} Route Map`} className="print-route-map" />
                        <p className="print-map-caption">📍 Day {day} 路线路径图 (时空对齐系统高精绘制)</p>
                      </div>
                    );
                  })()}

                  <div className="print-events-stream">
                    {dayEvents.map((ev, index) => (
                      <Fragment key={ev.id || index}>
                        <div className="print-event-card">
                          <div className="print-card-header">
                            <span className="print-event-time">{ev.time || "全天"}</span>
                            <h3 className="print-event-title">{ev.title} {ev.englishTitle ? `(${ev.englishTitle})` : ""}</h3>
                          </div>
                          
                          {/* Spot Address in Printed Card */}
                          {ev.address && (
                            <div className="print-event-address">
                              📍 地址：{ev.address}
                            </div>
                          )}

                          {ev.description && <p className="print-event-desc">💡 {ev.description}</p>}
                          
                          {ev.bookingRequired && (
                            <div className="print-ticket-badge">
                              🎫 票务提醒：需提前订票 {ev.ticketPrice ? `[ 价格: ${ev.ticketPrice} ]` : ""} {ev.bookingSession ? `[ 场次: ${ev.bookingSession} ]` : ""} {ev.advanceBookingTime ? `[ 提前量: ${ev.advanceBookingTime} ]` : ""}
                            </div>
                          )}
                        </div>

                        {/* Standardized between-card Transit Segment for print */}
                        {index < dayEvents.length - 1 && (
                          <div className="print-transit-bridge">
                            <div className="print-transit-badge">
                              <span>
                                {ev.transitMode === "DRIVING" ? "🚗 自驾 / 专车" : ev.transitMode === "WALKING" ? "🚶 步行 / 徒步" : ev.transitMode === "TRANSIT" ? "🚌 公共交通" : ev.transitMode === "FLIGHT" ? "✈️ 飞机" : ev.transitMode === "TRAIN" ? "🚄 火车" : "🚗 交通"}
                                {ev.transitDuration ? ` (约 ${ev.transitDuration})` : ""}
                              </span>
                              <span> 至下一地</span>
                            </div>
                            
                            {ev.transitNotes && (
                              <div className="print-transit-alert">
                                <span className="alert-icon">⚠️</span>
                                <span className="alert-text">{ev.transitNotes}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </Fragment>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

