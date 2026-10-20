// @ts-nocheck
(function () {
  "use strict";

  const API_BASE = "https://sse.radarthing.com";
  const AIRBORNE_SEND_INTERVAL_MS = 3000;
  const GROUND_SEND_INTERVAL_MS = 1000;
  const POSITION_REQUEST_TIMEOUT_MS = 10000;
  const COMMAND_POLL_INTERVAL_MS = 2000;

  let info = { active: false, dep: "", arr: "", flt: "", sqk: "", af: "" };
  let wasOnGround = true;
  let takeoffTimeUTC = "";
  let lastPositionSendAt = 0;
  let positionUpdateInFlight = false;
  let positionRequestSequence = 0;

  function sanitizeCallsign(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function sanitizeSquawk(value) {
    return String(value || "")
      .replace(/\D+/g, "")
      .slice(0, 4);
  }

  function getUserIdentifier(geofs = window.geofs) {
    return (
      geofs?.userRecord?.googleid ||
      sanitizeCallsign(geofs?.userRecord?.callsign)
    );
  }

  function getErrorDiagnostics(error) {
    return {
      name: error?.name || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
      cause: error?.cause || null,
      online: navigator.onLine,
      visibilityState: document.visibilityState,
      pageHidden: document.hidden,
      origin: window.location.origin,
      href: window.location.href,
    };
  }

  function getPositionPayloadDiagnostics(payload) {
    return {
      id: payload.id || null,
      googleId: payload.googleId || null,
      callsign: payload.callsign || null,
      flightNo: payload.flightNo || null,
      departure: payload.departure || null,
      arrival: payload.arrival || null,
      lat: payload.lat,
      lon: payload.lon,
      altMSL: payload.altMSL,
      speed: payload.speed,
      groundSpeed: payload.groundSpeed,
      ts: new Date().toISOString(),
    };
  }

  // Command execution handlers
  function executeCommand(cmd) {
    const geofs = window.geofs;
    if (!geofs?.autopilot || !geofs?.aircraft?.instance) {
      console.warn("[RadarThing] Cannot execute command - GeoFS not ready");
      return;
    }

    console.log("[RadarThing] Executing command:", cmd.type, cmd.value);

    try {
      switch (cmd.type) {
        case "setSpeed":
          if (typeof geofs.autopilot.setSpeed === "function") {
            geofs.autopilot.setSpeed(Number(cmd.value));
          }
          break;

        case "setSpeedMode": {
          const speedMode =
            String(cmd.value || "").toLowerCase() === "mach" ? "mach" : "knots";
          if (typeof geofs.autopilot.setSpeedMode === "function") {
            geofs.autopilot.setSpeedMode(speedMode);
          }
          break;
        }

        case "setAltitude":
          if (typeof geofs.autopilot.setAltitude === "function") {
            geofs.autopilot.setAltitude(Number(cmd.value));
          }
          break;

        case "setHeading":
          // Switch to heading mode using the proper GeoFS API
          if (typeof geofs.autopilot.setMode === "function") {
            geofs.autopilot.setMode("HDG");
          }
          // Set the course value
          if (typeof geofs.autopilot.setCourse === "function") {
            geofs.autopilot.setCourse(Number(cmd.value));
          }
          break;

        case "setVS":
          if (typeof geofs.autopilot.setVerticalSpeed === "function") {
            geofs.autopilot.setVerticalSpeed(Number(cmd.value));
          }
          break;

        case "setSquawk":
          // Update the squawk in flight info
          if (info) {
            info.sqk = sanitizeSquawk(cmd.value);
            window.dispatchEvent(
              new CustomEvent("atc-data-sync", { detail: info }),
            );
            // Also update the squawk input field in the UI
            window.dispatchEvent(
              new CustomEvent("atc-squawk-update", {
                detail: { squawk: info.sqk },
              }),
            );
          }
          break;

        case "setFlaps":
          // Set flaps by notch number (value is the notch, e.g., 2 out of 3 steps)
          if (controls?.flaps) {
            const maxPos = controls.flaps.maxPosition || 6;
            const flapsSteps = geofs.animation?.values?.flapsSteps || maxPos;
            const notch = Math.round(Number(cmd.value));
            if (notch < 0 || notch > flapsSteps) {
              console.warn(
                `[RadarThing] setFlaps - invalid notch ${notch}, must be 0-${flapsSteps}`,
              );
              break;
            }
            // Convert notch to actual position: notch/steps * maxPosition
            const flapPos = Math.round((notch / flapsSteps) * maxPos);
            controls.flaps.target = flapPos;
            controls.flaps.position = flapPos;
          }
          break;

        case "enableNav":
          if (typeof geofs.autopilot.setMode === "function") {
            geofs.autopilot.setMode("NAV");
          }
          break;

        case "disableNav":
          // Switch to heading mode using the proper GeoFS API
          if (typeof geofs.autopilot.setMode === "function") {
            geofs.autopilot.setMode("HDG");
          }
          break;

        case "setWaypoint": {
          const waypointIdent = String(cmd.value || "")
            .trim()
            .toUpperCase();
          const flightPlan = geofs.flightPlan;
          const route = flightPlan?.waypointArray || [];

          if (!waypointIdent || !Array.isArray(route) || route.length === 0) {
            console.warn("[RadarThing] setWaypoint - no usable flight plan");
            break;
          }

          const waypointIndex = route.findIndex((waypoint) => {
            const ident =
              waypoint?.ident ||
              waypoint?.name ||
              waypoint?.id ||
              waypoint?.icao;
            return (
              String(ident || "")
                .trim()
                .toUpperCase() === waypointIdent
            );
          });

          if (waypointIndex < 0) {
            console.warn(
              `[RadarThing] setWaypoint - waypoint ${waypointIdent} not found`,
            );
            break;
          }

          const waypoint = route[waypointIndex];

          if (typeof flightPlan.selectWaypoint === "function") {
            flightPlan.selectWaypoint(waypointIndex);
          } else {
            console.warn(
              "[RadarThing] setWaypoint - selectWaypoint is not available",
            );

            if ("trackedWaypoint" in flightPlan) {
              flightPlan.trackedWaypoint = waypoint;
            }

            if (typeof geofs.autopilot.setMode === "function") {
              geofs.autopilot.setMode("NAV");
            }
          }
          break;
        }

        case "toggleAutopilot":
          if (cmd.value && typeof geofs.autopilot.turnOn === "function") {
            geofs.autopilot.turnOn();
          } else if (
            !cmd.value &&
            typeof geofs.autopilot.turnOff === "function"
          ) {
            geofs.autopilot.turnOff();
          }
          break;

        case "disconnectFlight":
          stopFollow();
          window.dispatchEvent(
            new CustomEvent("atc-data-sync", {
              detail: { active: false },
            }),
          );
          window.dispatchEvent(
            new CustomEvent("radarthing-flight-disconnected"),
          );
          break;

        default:
          console.warn("[RadarThing] Unknown command type:", cmd.type);
      }

      // Notify UI of command execution
      window.dispatchEvent(
        new CustomEvent("radarthing-command-executed", {
          detail: { type: cmd.type, value: cmd.value, success: true },
        }),
      );
    } catch (err) {
      console.error("[RadarThing] Command execution error:", err);
      window.dispatchEvent(
        new CustomEvent("radarthing-command-executed", {
          detail: {
            type: cmd.type,
            value: cmd.value,
            success: false,
            error: err.message,
          },
        }),
      );
    }
  }

  // Poll for commands from RadarThing server
  async function pollCommands() {
    const geofs = window.geofs;
    if (!geofs?.userRecord) return;

    const id = getUserIdentifier(geofs);
    if (!id) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/commands/${encodeURIComponent(id)}`,
      );
      if (!res.ok) return;

      const data = await res.json();
      if (data.commands && data.commands.length > 0) {
        console.log(`[RadarThing] Received ${data.commands.length} commands`);
        data.commands.forEach(executeCommand);
      }
    } catch (err) {
      // Silent fail - server might be unavailable
    }
  }

  // Start command polling
  setInterval(pollCommands, COMMAND_POLL_INTERVAL_MS);

  function broadcastStatus() {
    let status = { text: "Flight info required", color: "#94a3b8" };
    if (info.active) {
      status = { text: "Transmitting to API", color: "#7dd3fc" };
    }
    window.dispatchEvent(
      new CustomEvent("atc-status-update", { detail: status }),
    );
  }

  window.addEventListener("atc-data-sync", (e) => {
    const wasActive = info.active;
    if (
      typeof e.detail?.takeoffTime === "string" &&
      e.detail.takeoffTime.trim()
    ) {
      takeoffTimeUTC = e.detail.takeoffTime.trim();
    }
    info = {
      ...e.detail,
      flt: sanitizeCallsign(e.detail?.flt),
      sqk: sanitizeSquawk(e.detail?.sqk),
    };
    broadcastStatus();

    // If flight was active and is now cleared, end the flight immediately
    if (wasActive && !info.active) {
      console.log("[RadarThing] Flight cleared, ending immediately...");
      endFlight();
    }
  });

  // End flight and save to database immediately
  async function endFlight() {
    const geofs = window.geofs;
    if (!geofs?.userRecord) {
      console.warn("[RadarThing] Cannot end flight - no userRecord");
      return;
    }

    const id = getUserIdentifier(geofs);
    if (!id) {
      console.warn("[RadarThing] Cannot end flight - no id");
      return;
    }

    console.log(`[RadarThing] Ending flight session for id=${id}...`);

    try {
      const res = await fetch(`${API_BASE}/api/end-flight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id,
          googleId: geofs.userRecord.googleid || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.finalized) {
          console.log(`[RadarThing] Flight ended and saved: ${data.flightNo}`);
        } else {
          console.log(
            `[RadarThing] No active session to end: ${data.reason || "unknown"}`,
          );
        }
      } else {
        console.error(`[RadarThing] End flight request failed: ${res.status}`);
      }
    } catch (err) {
      console.error("[RadarThing] Error ending flight:", err);
    }

    // Reset takeoff time for next flight
    wasOnGround = true;
    takeoffTimeUTC = "";
  }

  function calculateAGL() {
    try {
      const geofs = window.geofs;
      const altitudeMSL = geofs?.animation?.values?.altitude;
      const groundElevationFeet = geofs?.animation?.values?.groundElevationFeet;
      const aircraft = geofs?.aircraft?.instance;
      if (
        typeof altitudeMSL === "number" &&
        typeof groundElevationFeet === "number" &&
        aircraft?.collisionPoints?.length >= 2
      ) {
        const collisionZFeet =
          aircraft.collisionPoints[aircraft.collisionPoints.length - 2]
            .worldPosition[2] * 3.2808399;
        return Math.round(altitudeMSL - groundElevationFeet + collisionZFeet);
      }
    } catch (err) {}
    return null;
  }

  setInterval(async () => {
    const geofs = window.geofs;
    if (!info.active || !geofs?.aircraft?.instance) return;
    if (positionUpdateInFlight) return;

    const onGround =
      geofs.aircraft.instance.groundContact ??
      geofs?.animation?.values?.groundContact ??
      false;
    const interval = onGround
      ? GROUND_SEND_INTERVAL_MS
      : AIRBORNE_SEND_INTERVAL_MS;
    const now = Date.now();
    if (now - lastPositionSendAt < interval) return;

    lastPositionSendAt = now;
    positionUpdateInFlight = true;
    let requestId = null;
    let requestStartedAt = null;
    let payloadDiagnostics = null;

    try {
      const inst = geofs.aircraft.instance;
      if (wasOnGround && !onGround) takeoffTimeUTC = new Date().toISOString();
      wasOnGround = onGround;

      const lla = inst.llaLocation || [];
      if (!Number.isFinite(lla[0]) || !Number.isFinite(lla[1])) {
        return;
      }

      const altMSL =
        typeof lla[2] === "number"
          ? lla[2] * 3.28084
          : (geofs?.animation?.values?.altitude ?? 0);
      const altAGL = calculateAGL();
      let flightPlan = [];
      try {
        flightPlan = geofs?.flightPlan?.export ? geofs.flightPlan.export() : [];
      } catch (error) {
        console.warn("[RadarThing] Failed to export flight plan", error);
      }

      const payload = {
        id: getUserIdentifier(geofs),
        googleId: geofs?.userRecord?.googleid || null,
        source: "radarthing",
        callsign: sanitizeCallsign(geofs?.userRecord?.callsign),
        type: inst.aircraftRecord?.name || "Unknown",
        lat: lla[0],
        lon: lla[1],
        alt: typeof altAGL === "number" ? altAGL : Math.round(altMSL),
        altMSL: Math.round(altMSL),
        heading: Math.round(geofs?.animation?.values?.heading360 || 0),
        speed: Math.round(geofs?.animation?.values?.kias || 0),
        groundSpeed: Math.round(
          geofs?.animation?.values?.groundSpeed ||
            geofs?.animation?.values?.kias ||
            0,
        ),
        flightNo: sanitizeCallsign(info.flt),
        departure: info.dep,
        arrival: info.arr,
        takeoffTime: takeoffTimeUTC,
        squawk: sanitizeSquawk(info.sqk),
        af: info.af || "",
        flightPlan,
        nextWaypoint: geofs?.flightPlan?.trackedWaypoint?.ident || null,
        distanceLeft: Number.isFinite(geofs?.flightPlan?.distanceLeft)
          ? Math.round(geofs.flightPlan.distanceLeft)
          : null,
        vspeed: Math.floor(geofs?.animation?.values?.verticalSpeed || 0),
        navMode: geofs?.autopilot?.mode === "NAV",
        speedMode: geofs?.autopilot?.speedMode === "mach" ? "mach" : "knots",
        flapsPosition: controls?.flaps?.position || 0,
        flapsMaxPosition:
          geofs?.animation?.values?.flapsSteps ||
          controls?.flaps?.maxPosition ||
          0,
      };

      requestId = ++positionRequestSequence;
      requestStartedAt = Date.now();
      payloadDiagnostics = getPositionPayloadDiagnostics(payload);
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        POSITION_REQUEST_TIMEOUT_MS,
      );
      let res;
      try {
        res = await fetch(`${API_BASE}/api/atc/position`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        console.warn(
          `[RadarThing] Position update #${requestId} failed with HTTP ${res.status}`,
          {
            requestId,
            status: res.status,
            statusText: res.statusText,
            elapsedMs: Date.now() - requestStartedAt,
            payload: payloadDiagnostics,
          },
        );
      }
    } catch (error) {
      console.warn("[RadarThing] Position update failed before send", {
        requestId,
        elapsedMs:
          typeof requestStartedAt === "number"
            ? Date.now() - requestStartedAt
            : null,
        timeoutMs: POSITION_REQUEST_TIMEOUT_MS,
        payload:
          typeof payloadDiagnostics === "object" ? payloadDiagnostics : null,
        error: getErrorDiagnostics(error),
        rawError: error,
      });
    } finally {
      positionUpdateInFlight = false;
    }
  }, GROUND_SEND_INTERVAL_MS);
})();
