(function () {
  "use strict";

  const API_BASE = "https://geofs-flightradar.duckdns.org";
  const SEND_INTERVAL_MS = 3000;

  let lastAircraftId = null;
  let wasOnGround = true;
  let takeoffTimeUTC = "";
  let landingDetected = false;
  let preLandingVertSpeed = 0;
  let preLandingGroundSpeed = 0;
  let preLandingGForce = 1;
  let preLandingRoll = 0;

  window.geofsFlightInfo = window.geofsFlightInfo || {
    departure: "",
    arrival: "",
    originalArrival: "",
    actualArrival: "",
    flightNo: "",
    squawk: "",
    confirmed: false,
    isDiverted: false,
    active: false,
  };

  const flightInfo = window.geofsFlightInfo;

  function reportUrl(path) {
    return `${API_BASE}${path}`;
  }

  async function postJSON(path, payload, options = {}) {
    const body = JSON.stringify(payload);

    if (options.beacon && navigator.sendBeacon) {
      return navigator.sendBeacon(
        reportUrl(path),
        new Blob([body], { type: "application/json" }),
      );
    }

    const res = await fetch(reportUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      mode: "cors",
      credentials: "omit",
      keepalive: Boolean(options.keepalive),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => ({}));
  }

  function safeSend(obj, options = {}) {
    try {
      if (obj.type === "position_update" && obj.payload) {
        lastAircraftId =
          obj.payload.id || obj.payload.callsign || lastAircraftId;
        postJSON("/api/report/position", obj.payload, options).catch((e) => {
          console.warn("[ATC-Reporter] HTTP position error", e);
        });
        return;
      }

      if (obj.type === "landing_report" && obj.payload) {
        const payload = {
          ...obj.payload,
          aircraftId: lastAircraftId || obj.payload.callsign || null,
        };
        postJSON("/api/report/landing", payload, {
          ...options,
          keepalive: true,
        }).catch((e) => {
          console.warn("[ATC-Reporter] HTTP landing error", e);
        });
      }
    } catch (e) {
      console.warn("[ATC-Reporter] send error", e);
    }
  }

  function reportDisconnect() {
    if (!lastAircraftId) return;
    try {
      postJSON(
        "/api/report/disconnect",
        { aircraftId: lastAircraftId },
        { beacon: true, keepalive: true },
      );
    } catch {}
  }

  function dispatchStatus(text, color) {
    window.dispatchEvent(
      new CustomEvent("atc-status-update", {
        detail: { text, color },
      }),
    );
  }

  function readGeoFSAirspeedKnots() {
    const kias = geofs?.animation?.values?.kias;
    return typeof kias === "number" && Number.isFinite(kias) ? kias : null;
  }

  function readFiniteNumber(...values) {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
  }

  function vectorMagnitude(vector) {
    if (!Array.isArray(vector) || vector.length < 2) return null;

    const x = Number(vector[0]);
    const y = Number(vector[1]);
    const z = Number(vector[2] || 0);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return Math.sqrt(x * x + y * y + z * z);
  }

  function readGeoFSGroundSpeed(inst = geofs?.aircraft?.instance) {
    const metersPerSecond = readFiniteNumber(
      inst?.groundSpeed,
      inst?.velocityScalar,
      vectorMagnitude(inst?.velocity),
    );

    return metersPerSecond === null
      ? null
      : {
          knots: metersPerSecond * 1.94384,
          raw: metersPerSecond,
          source:
            inst?.groundSpeed !== undefined
              ? "groundSpeed"
              : inst?.velocityScalar !== undefined
                ? "velocityScalar"
                : "velocity",
        };
  }

  function readGeoFSVersionString() {
    const candidates = [
      geofs?.version,
      geofs?.VERSION,
      geofs?.release,
      geofs?.api?.version,
      geofs?.preferences?.version,
      window?.geofsVersion,
      window?.GeoFSVersion,
      window?.GEofsVersion,
      window?.GEoFSVersion,
    ];

    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }

    return "";
  }

  function getGeoFSMajorMinorVersion() {
    const version = readGeoFSVersionString();
    const match = version.match(/(\d+)\.(\d+)/);
    return match ? `${match[1]}.${match[2]}` : "";
  }

  function shouldUseLegacyKiasSpeed() {
    return getGeoFSMajorMinorVersion() === "3.9";
  }

  function readReportedSpeed(inst = geofs?.aircraft?.instance) {
    const legacyKias = shouldUseLegacyKiasSpeed();
    const groundSpeed = legacyKias ? null : readGeoFSGroundSpeed(inst);
    const airspeed = readGeoFSAirspeedKnots();
    const speedType = groundSpeed ? "ground" : "air";

    return {
      knots: groundSpeed?.knots ?? airspeed ?? 0,
      type: speedType,
      source: groundSpeed?.source || "kias",
      unit: "kt",
      raw: groundSpeed?.raw ?? airspeed ?? 0,
    };
  }

  function getExportedFlightPlan() {
    function looksLikeWaypoint(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }

      return (
        typeof value.ident === "string" ||
        typeof value.name === "string" ||
        typeof value.icao === "string" ||
        typeof value.iata === "string" ||
        typeof value.airport === "string" ||
        typeof value.code === "string" ||
        typeof value.label === "string" ||
        (typeof value.lat === "number" && typeof value.lon === "number")
      );
    }

    function findWaypointArray(root) {
      const queue = [root];
      const seen = new Set();
      let inspected = 0;

      while (queue.length && inspected < 200) {
        const current = queue.shift();
        if (!current || typeof current !== "object" || seen.has(current)) {
          continue;
        }

        seen.add(current);
        inspected += 1;

        if (Array.isArray(current)) {
          if (current.length && current.some(looksLikeWaypoint)) {
            return current;
          }

          for (const item of current) {
            if (item && typeof item === "object") queue.push(item);
          }
          continue;
        }

        for (const value of Object.values(current)) {
          if (!value) continue;
          if (Array.isArray(value)) {
            if (value.length && value.some(looksLikeWaypoint)) {
              return value;
            }
            queue.push(value);
            continue;
          }

          if (typeof value === "object") queue.push(value);
        }
      }

      return [];
    }

    try {
      const flightPlan = geofs?.flightPlan;
      if (!flightPlan) return [];

      if (typeof flightPlan.export === "function") {
        const exported = flightPlan.export();
        if (Array.isArray(exported)) return exported;

        const exportedPlan = findWaypointArray(exported);
        if (exportedPlan.length) return exportedPlan;
      }

      const livePlan = findWaypointArray(flightPlan);
      if (livePlan.length) return livePlan;
    } catch {}

    return [];
  }

  function extractWaypointLabel(waypoint) {
    if (!waypoint) return "";
    if (typeof waypoint === "string") return waypoint.trim().toUpperCase();

    const candidates = [
      waypoint.ident,
      waypoint.name,
      waypoint.icao,
      waypoint.iata,
      waypoint.airport,
      waypoint.code,
    ];

    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) {
        return value.trim().toUpperCase();
      }
    }

    return "";
  }

  function sanitizeWaypoint(waypoint) {
    if (!waypoint) return null;

    if (typeof waypoint === "string") {
      const label = waypoint.trim();
      return label ? { ident: label.toUpperCase() } : null;
    }

    if (typeof waypoint !== "object") return null;

    const lat = Number(
      waypoint.lat ?? waypoint.latitude ?? waypoint.location?.[0],
    );
    const lon = Number(
      waypoint.lon ??
        waypoint.lng ??
        waypoint.longitude ??
        waypoint.location?.[1],
    );

    const sanitized = {
      ident: extractWaypointLabel(waypoint) || undefined,
      name:
        typeof waypoint.name === "string" && waypoint.name.trim()
          ? waypoint.name.trim()
          : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
    };

    if (
      !sanitized.ident &&
      !sanitized.name &&
      sanitized.lat === undefined &&
      sanitized.lon === undefined
    ) {
      return null;
    }

    return sanitized;
  }

  function sanitizeFlightPlan(plan) {
    if (!Array.isArray(plan)) return [];
    return plan.map(sanitizeWaypoint).filter(Boolean);
  }

  function getAircraftName() {
    return geofs?.aircraft?.instance?.aircraftRecord?.name || "Unknown";
  }

  function getPlayerCallsign() {
    return geofs?.userRecord?.callsign || "Unknown";
  }

  function calculateAGL() {
    try {
      const altitudeMSL = geofs?.animation?.values?.altitude;
      const groundElevationFeet = geofs?.animation?.values?.groundElevationFeet;
      const aircraft = geofs?.aircraft?.instance;

      if (
        typeof altitudeMSL === "number" &&
        typeof groundElevationFeet === "number" &&
        aircraft?.collisionPoints?.length >= 2 &&
        typeof aircraft.collisionPoints[aircraft.collisionPoints.length - 2]
          ?.worldPosition?.[2] === "number"
      ) {
        const collisionZFeet =
          aircraft.collisionPoints[aircraft.collisionPoints.length - 2]
            .worldPosition[2] * 3.2808399;
        return Math.round(altitudeMSL - groundElevationFeet + collisionZFeet);
      }
    } catch (err) {
      console.warn("[ATC-Reporter] AGL calculation error:", err);
    }

    return null;
  }

  function classifyLanding(vertSpeedFpm) {
    if (vertSpeedFpm > 200 || vertSpeedFpm < -1000) return "CRASH";
    if (vertSpeedFpm >= -30) return "BUTTER";
    if (vertSpeedFpm >= -200) return "GREAT";
    if (vertSpeedFpm >= -500) return "ACCEPTABLE";
    return "HARD LANDING";
  }

  function shouldReportLandingQuality() {
    return Boolean(
      flightInfo?.confirmed &&
      takeoffTimeUTC &&
      flightInfo.departure &&
      flightInfo.arrival,
    );
  }

  function reportLanding(vertSpeedFpm, groundSpeedKts, gForce, rollDeg) {
    if (!shouldReportLandingQuality()) {
      return;
    }

    const quality = classifyLanding(vertSpeedFpm);
    const landingTime = new Date().toISOString();

    safeSend({
      type: "landing_report",
      payload: {
        callsign: getPlayerCallsign(),
        flightNo: flightInfo.flightNo,
        departure: flightInfo.departure,
        arrival: flightInfo.actualArrival || flightInfo.arrival,
        userId: geofs?.userRecord?.id || null,
        landingTime,
        verticalSpeed: Math.round(vertSpeedFpm),
        groundSpeed: Math.round(groundSpeedKts),
        gForce: Math.round(gForce * 100) / 100,
        rollAngle: Math.round(rollDeg * 10) / 10,
        flightConfirmed: true,
        landingQuality: quality,
      },
    });
  }

  function checkTakeoff() {
    const inst = geofs?.aircraft?.instance;
    const onGround =
      inst?.groundContact ?? geofs?.animation?.values?.groundContact ?? true;

    if (!onGround) {
      const vs = geofs?.animation?.values?.verticalSpeed ?? 0;
      const gs = geofs?.animation?.values?.groundSpeedKnt ?? 0;
      const gz = geofs?.animation?.values?.accZ ?? 9.80665;
      const roll = Math.abs(geofs?.animation?.values?.aroll ?? 0);

      preLandingVertSpeed = vs;
      preLandingGroundSpeed = gs;
      preLandingGForce = gz / 9.80665;
      preLandingRoll = roll;
      landingDetected = false;
    }

    if (wasOnGround && !onGround) {
      takeoffTimeUTC = new Date().toISOString();
    }

    if (!wasOnGround && onGround && !landingDetected) {
      landingDetected = true;
      reportLanding(
        preLandingVertSpeed,
        preLandingGroundSpeed,
        preLandingGForce,
        preLandingRoll,
      );
    }

    wasOnGround = onGround;
  }

  function readSnapshot() {
    try {
      const inst = geofs?.aircraft?.instance;
      if (!inst) return null;

      const lla = inst.llaLocation || [];
      const lat = lla[0];
      const lon = lla[1];
      const altMeters = lla[2];

      if (typeof lat !== "number" || typeof lon !== "number") return null;

      const altMSL =
        typeof altMeters === "number"
          ? altMeters * 3.28084
          : (geofs?.animation?.values?.altitude ?? 0);
      const altAGL = calculateAGL();
      const heading = geofs?.animation?.values?.heading360 ?? 0;
      const speed = readReportedSpeed(inst);

      return { lat, lon, altMSL, altAGL, heading, speed };
    } catch (e) {
      console.warn("[ATC-Reporter] readSnapshot error:", e);
      return null;
    }
  }

  function buildPayload(snap) {
    checkTakeoff();

    const flightPlan = sanitizeFlightPlan(getExportedFlightPlan());
    const userId = geofs?.userRecord?.id || null;
    const arrival = flightInfo.actualArrival || flightInfo.arrival;

    return {
      id: getPlayerCallsign(),
      callsign: getPlayerCallsign(),
      type: getAircraftName(),
      lat: snap.lat,
      lon: snap.lon,
      alt:
        typeof snap.altAGL === "number"
          ? snap.altAGL
          : Math.round(snap.altMSL || 0),
      altMSL: Math.round(snap.altMSL || 0),
      heading: Math.round(snap.heading || 0),
      speed: Math.round(snap.speed?.knots || 0),
      speedType: snap.speed?.type || "air",
      speedSource: snap.speed?.source || "",
      speedUnit: snap.speed?.unit || "kt",
      speedRaw: Math.round((snap.speed?.raw || 0) * 10) / 10,
      geofsVersion: readGeoFSVersionString(),
      geofsMajorMinor: getGeoFSMajorMinorVersion(),
      flightNo: flightInfo.flightNo,
      departure: flightInfo.departure,
      arrival,
      originalArrival: flightInfo.originalArrival || flightInfo.arrival,
      actualArrival: arrival,
      isDiverted: Boolean(flightInfo.isDiverted),
      takeoffTime: takeoffTimeUTC,
      squawk: flightInfo.squawk,
      flightConfirmed: Boolean(flightInfo.confirmed),
      flightPlan,
      nextWaypoint: geofs?.flightPlan?.trackedWaypoint?.ident || null,
      userId,
    };
  }

  function syncFlightInfo(detail = {}) {
    if (detail.active === false) {
      flightInfo.departure = "";
      flightInfo.arrival = "";
      flightInfo.originalArrival = "";
      flightInfo.actualArrival = "";
      flightInfo.flightNo = "";
      flightInfo.squawk = "";
      flightInfo.confirmed = false;
      flightInfo.isDiverted = false;
      flightInfo.active = false;
      reportDisconnect();
      dispatchStatus("Flight info required", "#f87171");
      return;
    }

    flightInfo.departure = detail.dep || detail.departure || "";
    flightInfo.arrival = detail.arr || detail.arrival || "";
    flightInfo.isDiverted = Boolean(detail.isDiverted);
    flightInfo.originalArrival = detail.originalArrival || flightInfo.arrival;
    flightInfo.actualArrival = detail.actualArrival || flightInfo.arrival;
    flightInfo.flightNo = detail.flt || detail.flightNo || "";
    flightInfo.squawk = detail.sqk || detail.squawk || "";
    flightInfo.confirmed = Boolean(
      flightInfo.departure && flightInfo.arrival && flightInfo.flightNo,
    );
    flightInfo.active = Boolean(detail.active && flightInfo.confirmed);

    dispatchStatus(
      flightInfo.active ? "Transmitting" : "Flight info required",
      flightInfo.active ? "#22c55e" : "#f87171",
    );
  }

  window.addEventListener("pagehide", reportDisconnect);
  window.addEventListener("beforeunload", reportDisconnect);
  window.addEventListener("atc-data-sync", (e) =>
    syncFlightInfo(e.detail || {}),
  );

  setInterval(() => {
    if (window.__radarPrefs?.seabus !== true) return;
    if (!flightInfo.active) return;

    const snap = readSnapshot();
    if (!snap) return;

    const payload = buildPayload(snap);
    safeSend({ type: "position_update", payload });
  }, SEND_INTERVAL_MS);

  const wait = setInterval(() => {
    if (window.geofs?.aircraft?.instance) {
      clearInterval(wait);
    }
  }, 500);
})();
