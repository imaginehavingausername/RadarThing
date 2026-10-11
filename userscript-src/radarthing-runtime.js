(function () {
  "use strict";

  // ==========================================
  // ATC FLIGHT INFO — Constants & State
  // ==========================================

  const STORAGE_KEY = "geofs-atc-toggle-key";
  const CHARTS_TOGGLE_KEY = "geofs-atc-charts-toggle-key";
  const RADAR_PREFS_KEY = "geofs-atc-radar-prefs";
  let toggleKey = localStorage.getItem(STORAGE_KEY) || "w";
  let chartsToggleKey = localStorage.getItem(CHARTS_TOGGLE_KEY) || "q";

  const UI_CONTAINER_ID = "geofs-atc-radar-flightInfoUI";
  const MOBILE_UI_CLOSE_ID = "geofs-atc-mobile-close";
  const MOBILE_UI_OPEN_ID = "geofs-atc-mobile-open";
  const DEP_INPUT_ID = "atc-depInput";
  const ARR_INPUT_ID = "atc-arrInput";
  const FLT_INPUT_ID = "atc-fltInput";
  const SQK_INPUT_ID = "atc-sqkInput";
  const SAVE_BTN_ID = "atc-saveBtn";
  const CLEAR_BTN_ID = "atc-clearBtn";
  const STATUS_INDICATOR_ID = "atc-statusIndicator";
  const MOST_TRACKED_BADGE_ID = "radarthing-most-tracked-badge";
  const SIGN_IN_NOTICE_ID = "atc-sign-in-notice";
  const KEYBIND_BTN_ID = "atc-keybind-btn";
  const CHARTS_KEYBIND_BTN_ID = "atc-charts-keybind-btn";
  const FLIGHT_UI_MOVE_BTN_ID = "atc-flight-ui-move-btn";
  const FLIGHT_UI_RESET_BTN_ID = "atc-flight-ui-reset-btn";
  const FLIGHT_UI_HEADER_ID = "atc-flight-ui-header";
  const FLIGHT_UI_POS_KEY = "geofs-atc-flight-ui-position";
  const RADAR_SETTINGS_HEADER_ID = "atc-radar-settings-header";
  const RADAR_SETTINGS_BODY_ID = "atc-radar-settings-body";
  const RADAR_SETTINGS_ARROW_ID = "atc-radar-settings-arrow";
  const SEABUS_TOGGLE_ID = "atc-toggle-seabus";
  const CHARTS_BTN_ID = "atc-charts-btn";
  const AF_INPUT_ID = "atc-afInput";
  const IDENT_BTN_ID = "atc-ident-btn";
  const IDENT_REQUEST_WINDOW_MS = 60000;
  const RESUME_FLIGHT_API = "https://sse.radarthing.com/api/resume-flight";
  const RESUME_MODAL_ID = "radarthing-resume-flight-modal";
  const TRACKING_STATUS_API =
    "https://radarthing.com/api/userscript/tracking-status";
  const TRACKING_STATUS_POLL_INTERVAL_MS = 15000;
  const ACARS_API = "https://radarthing.com/api/userscript/acars";
  const ACARS_DEVICE_API = `${ACARS_API}/device`;
  const ACARS_PANEL_ID = "radarthing-acars-panel";
  const ACARS_DRAFT_ID = "radarthing-acars-draft";
  const ACARS_PUBLISH_ID = "radarthing-acars-publish";
  const ACARS_LIST_ID = "radarthing-acars-list";

  let flightUI;
  let mobileFlightUIOpenButton;
  let keybindMode = null;
  let lastSyncedPlan = "";
  let identRequestUntil = 0;
  let identRequestDurationSeconds = 15;
  let identActiveUntil = 0;
  let resumePromptCheckStarted = false;
  let resumePromptResolved = false;
  let resumeModalResolver = null;
  let flightActiveForTrackingBadge = false;
  let trackingStatusRequestId = 0;
  let acarsBusy = false;
  let acarsRequestId = 0;

  function acarsPilotId() {
    const id = String(window.geofs?.userRecord?.googleid || "");
    return /^\d{8,32}$/.test(id) ? id : "";
  }

  function acarsDeviceToken(googleId) {
    const key = `radarthing-acars-device-${googleId}`;
    let token = localStorage.getItem(key);
    if (token && /^[a-f0-9]{64}$/.test(token)) return token;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(key, token);
    return token;
  }

  function acarsHeaders(token) {
    return {
      "Content-Type": "application/json",
      "X-Requested-With": "GeoFS-RadarThing",
      ...(token ? { "X-ACARS-Token": token } : {}),
    };
  }

  function updateAcarsAvailability() {
    const panel = document.getElementById(ACARS_PANEL_ID);
    const button = document.getElementById(ACARS_PUBLISH_ID);
    const draft = document.getElementById(ACARS_DRAFT_ID);
    const active = flightActiveForTrackingBadge && Boolean(acarsPilotId());
    if (panel) panel.style.display = active ? "block" : "none";
    if (button) button.disabled = !active || acarsBusy;
    if (draft) draft.disabled = !active || acarsBusy;
  }

  async function refreshAcars() {
    const list = document.getElementById(ACARS_LIST_ID);
    const googleId = acarsPilotId();
    const requestId = ++acarsRequestId;
    if (!list || !flightActiveForTrackingBadge || !googleId) return;
    try {
      const token = localStorage.getItem(`radarthing-acars-device-${googleId}`);
      const response = await fetch(`${ACARS_API}?googleId=${encodeURIComponent(googleId)}`, {
        cache: "no-store", headers: acarsHeaders(token),
      });
      if (!response.ok) throw new Error("Could not load ACARS entries");
      const data = await response.json();
      if (requestId !== acarsRequestId || acarsPilotId() !== googleId) return;
      list.replaceChildren();
      for (const message of data.messages || []) {
        const row = document.createElement("div");
        row.style.cssText = "border-top:1px solid rgba(255,255,255,.08);padding:8px 0;font-size:11px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere";
        const time = document.createElement("div");
        time.style.cssText = "font-size:9px;color:#67e8f9;margin-bottom:3px";
        time.textContent = new Date(message.createdAt).toLocaleString();
        const content = document.createElement("div");
        content.textContent = message.body;
        row.append(time, content);
        if (message.canRemove) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.textContent = "Remove";
          remove.style.cssText = "margin-top:4px;padding:0;border:0;background:none;color:#fca5a5;font-size:9px;cursor:pointer";
          remove.addEventListener("click", () => void removeAcars(message._id));
          row.appendChild(remove);
        }
        list.appendChild(row);
      }
      if (!data.messages?.length) list.textContent = "No ACARS entries yet.";
    } catch (_) {
      if (requestId === acarsRequestId) list.textContent = "Could not load ACARS entries.";
    }
  }

  async function removeAcars(messageId) {
    const googleId = acarsPilotId();
    const token = googleId && localStorage.getItem(`radarthing-acars-device-${googleId}`);
    if (!googleId || !token || !flightActiveForTrackingBadge) return;
    try {
      const response = await fetch(ACARS_API, {
        method: "DELETE", headers: acarsHeaders(token),
        body: JSON.stringify({ googleId, messageId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not remove ACARS entry");
      showToast("ACARS entry removed");
      await refreshAcars();
    } catch (error) {
      showToast(error?.message || "Could not remove ACARS entry", true);
    }
  }

  async function publishAcars() {
    const draft = document.getElementById(ACARS_DRAFT_ID);
    const googleId = acarsPilotId();
    const body = draft?.value.trim() || "";
    if (!flightActiveForTrackingBadge || !googleId) return showToast("Save an active flight while signed in to GeoFS", true);
    if (!body || body.length > 500) return showToast("Enter 1–500 ACARS characters", true);
    if (acarsBusy) return;
    acarsBusy = true;
    updateAcarsAvailability();
    try {
      const token = acarsDeviceToken(googleId);
      const registration = await fetch(ACARS_DEVICE_API, {
        method: "POST", headers: acarsHeaders(token),
        body: JSON.stringify({ googleId }),
      });
      const registered = await registration.json();
      if (!registration.ok) throw new Error(registered.error || "ACARS registration failed");
      const response = await fetch(ACARS_API, {
        method: "POST", headers: acarsHeaders(token),
        body: JSON.stringify({ googleId, body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ACARS publish failed");
      draft.value = "";
      showToast("ACARS published");
      await refreshAcars();
    } catch (error) {
      showToast(error?.message || "ACARS publish failed", true);
    } finally {
      acarsBusy = false;
      updateAcarsAvailability();
    }
  }
  function loadRadarPrefs() {
    try {
      const raw = localStorage.getItem(RADAR_PREFS_KEY);
      if (!raw) return { seabus: true };

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { seabus: true };
      }

      return {
        seabus: parsed.seabus !== false,
      };
    } catch (_) {
      return { seabus: true };
    }
  }

  let radarPrefs = loadRadarPrefs();
  window.__radarPrefs = radarPrefs;

  // ==========================================
  // AIRPORT CHARTS — Constants & State
  // ==========================================

  const CHARTS_API = "https://radarthing.com";
  const CHARTS_PANEL_ID = "gc-panel";
  const CHARTS_POS_KEY = "geofs-charts-pos";
  const CHARTS_SIZE_KEY = "geofs-charts-size";
  const CHARTS_ICAO_KEY = "geofs-charts-icao";
  const CHARTS_CACHE_KEY = "geofs-airport-charts-v1";
  const CHARTS_ROTATIONS_KEY = "radarthing-chart-rotations-v1";
  const CHART_TYPES = ["TAXI", "SID", "STAR", "APPROACH"];
  const CHARTS_DEFAULT_TOP = 60;
  const CHARTS_DEFAULT_LEFT = 16;
  const CHARTS_DEFAULT_WIDTH = 370;
  const chartsMemoryCache = new Map();
  let storedChartRotations = null;

  const chartsState = {
    currentIcao: "",
    chartsByType: { TAXI: [], SID: [], STAR: [], APPROACH: [] },
    currentType: "TAXI",
    selectedChartId: null,
    invertColors: true,
    rotation: 0,
    zoom: { scale: 1, panX: 0, panY: 0 },
  };
  const chartsUi = {
    panel: null,
    title: null,
    typeTabs: null,
    chartList: null,
    preview: null,
    invertToggle: null,
    rotateToggle: null,
    previewWrap: null,
    previewImg: null,
    previewChartId: null,
    heightFrame: 0,
  };

  // ==========================================
  // ATC FLIGHT INFO — Functions
  // ==========================================

  function isICAO(str) {
    return /^[A-Z]{4}$/.test(str);
  }

  function isMobileBrowser() {
    const uaMobile = navigator.userAgentData?.mobile;
    if (typeof uaMobile === "boolean") return uaMobile;

    const isIPad =
      navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const hasMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(
      navigator.userAgent,
    );

    return (
      isIPad ||
      hasMobileUserAgent ||
      (window.matchMedia("(pointer: coarse)").matches &&
        window.innerWidth < 1024)
    );
  }

  function setFlightUIVisible(visible) {
    if (!flightUI) return;
    flightUI.style.display = visible ? "block" : "none";
    if (mobileFlightUIOpenButton) {
      mobileFlightUIOpenButton.style.display = visible ? "none" : "flex";
    }
  }

  function loadFlightUiPosition() {
    try {
      const position = JSON.parse(localStorage.getItem(FLIGHT_UI_POS_KEY));
      if (
        !position ||
        !Number.isFinite(position.left) ||
        !Number.isFinite(position.top)
      ) {
        return null;
      }
      return position;
    } catch (_) {
      return null;
    }
  }

  function clampFlightUiToViewport() {
    if (!flightUI || !flightUI.style.left) return;

    const margin = 12;
    const maxLeft = Math.max(
      margin,
      window.innerWidth - flightUI.offsetWidth - margin,
    );
    const maxTop = Math.max(
      margin,
      window.innerHeight - flightUI.offsetHeight - margin,
    );
    const left = parseFloat(flightUI.style.left) || margin;
    const top = parseFloat(flightUI.style.top) || margin;

    flightUI.style.left = `${Math.min(Math.max(left, margin), maxLeft)}px`;
    flightUI.style.top = `${Math.min(Math.max(top, margin), maxTop)}px`;
  }

  function saveFlightUiPosition() {
    if (!flightUI || !flightUI.style.left) return;
    localStorage.setItem(
      FLIGHT_UI_POS_KEY,
      JSON.stringify({
        left: parseFloat(flightUI.style.left),
        top: parseFloat(flightUI.style.top),
      }),
    );
  }

  function makeFlightUiMovable() {
    const moveButton = document.getElementById(FLIGHT_UI_MOVE_BTN_ID);
    const resetButton = document.getElementById(FLIGHT_UI_RESET_BTN_ID);
    const header = document.getElementById(FLIGHT_UI_HEADER_ID);
    if (!moveButton || !resetButton || !header || !flightUI) return;

    let moveMode = false;
    let dragging = false;
    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;

    const updateMoveMode = () => {
      moveButton.textContent = moveMode ? "Done" : "Move panel";
      moveButton.setAttribute("aria-pressed", String(moveMode));
      moveButton.title = moveMode
        ? "Lock panel in place"
        : "Enable panel moving";
      moveButton.style.background = moveMode
        ? "rgba(34,211,238,0.22)"
        : "rgba(255,255,255,0.06)";
      moveButton.style.borderColor = moveMode
        ? "rgba(34,211,238,0.55)"
        : "rgba(255,255,255,0.12)";
      moveButton.style.color = moveMode ? "#a5f3fc" : "#94a3b8";
      header.style.cursor = moveMode ? "grab" : "default";
      header.title = moveMode ? "Drag this header to move the panel" : "";
    };

    moveButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveMode = !moveMode;
      updateMoveMode();
    });

    resetButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveMode = false;
      flightUI.style.left = "";
      flightUI.style.top = "72px";
      flightUI.style.right = "16px";
      localStorage.removeItem(FLIGHT_UI_POS_KEY);
      updateMoveMode();
    });

    header.addEventListener("pointerdown", (event) => {
      if (!moveMode || event.target.closest("button")) return;

      const rect = flightUI.getBoundingClientRect();
      flightUI.style.left = `${rect.left}px`;
      flightUI.style.top = `${rect.top}px`;
      flightUI.style.right = "auto";
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      dragging = true;
      pointerId = event.pointerId;
      header.setPointerCapture(pointerId);
      header.style.cursor = "grabbing";
      event.preventDefault();
    });

    header.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      flightUI.style.left = `${event.clientX - offsetX}px`;
      flightUI.style.top = `${event.clientY - offsetY}px`;
      clampFlightUiToViewport();
    });

    const stopDragging = (event) => {
      if (!dragging || (event && event.pointerId !== pointerId)) return;
      dragging = false;
      pointerId = null;
      if (header.hasPointerCapture(event?.pointerId)) {
        header.releasePointerCapture(event.pointerId);
      }
      saveFlightUiPosition();
      updateMoveMode();
    };

    header.addEventListener("pointerup", stopDragging);
    header.addEventListener("pointercancel", stopDragging);
    window.addEventListener("resize", () => {
      if (!flightUI.style.left) return;
      clampFlightUiToViewport();
      saveFlightUiPosition();
    });

    updateMoveMode();
  }

  function sanitizeFlightCallsign(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function hideMostTrackedBadge() {
    const badge = document.getElementById(MOST_TRACKED_BADGE_ID);
    if (badge) badge.style.display = "none";
  }

  async function refreshMostTrackedBadge() {
    const badge = document.getElementById(MOST_TRACKED_BADGE_ID);
    const callsign = sanitizeFlightCallsign(window.geofs?.userRecord?.callsign);
    const requestId = ++trackingStatusRequestId;

    if (!badge || !flightActiveForTrackingBadge || !callsign) {
      hideMostTrackedBadge();
      return;
    }

    try {
      const response = await fetch(
        `${TRACKING_STATUS_API}?callsign=${encodeURIComponent(callsign)}`,
        {
          cache: "no-store",
          headers: { "X-Requested-With": "GeoFS-RadarThing" },
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const status = await response.json();
      const currentCallsign = sanitizeFlightCallsign(
        window.geofs?.userRecord?.callsign,
      );
      if (
        requestId !== trackingStatusRequestId ||
        !flightActiveForTrackingBadge ||
        currentCallsign !== callsign
      ) {
        return;
      }

      if (!status.isMostTracked) {
        hideMostTrackedBadge();
        return;
      }

      const count = Math.max(0, Number(status.count) || 0);
      const countEl = badge.querySelector("[data-tracker-count]");
      if (countEl) {
        countEl.textContent = `${count} viewer${count === 1 ? "" : "s"}`;
      }
      badge.title = `${count} people are viewing your flight on RadarThing`;
      badge.style.display = "flex";
    } catch (_) {
      if (requestId === trackingStatusRequestId) hideMostTrackedBadge();
    }
  }

  function normalizeFlightInfoValue(value) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  function sanitizeSquawk(value) {
    return String(value || "")
      .replace(/\D+/g, "")
      .slice(0, 4);
  }

  function doesSessionMatchCurrentForm(session) {
    const currentFlightNo = normalizeFlightInfoValue(
      document.getElementById(FLT_INPUT_ID)?.value,
    );
    const currentDeparture = normalizeFlightInfoValue(
      document.getElementById(DEP_INPUT_ID)?.value,
    );
    const currentArrival = normalizeFlightInfoValue(
      document.getElementById(ARR_INPUT_ID)?.value,
    );
    const sessionFlightNo = normalizeFlightInfoValue(
      session?.flightNo || session?.callsign,
    );
    const sessionDeparture = normalizeFlightInfoValue(
      session?.departure || session?.dep,
    );
    const sessionArrival = normalizeFlightInfoValue(
      session?.arrival || session?.arr,
    );

    if (
      !currentFlightNo ||
      !sessionFlightNo ||
      currentFlightNo !== sessionFlightNo
    ) {
      return false;
    }

    if (
      currentDeparture &&
      sessionDeparture &&
      currentDeparture !== sessionDeparture
    ) {
      return false;
    }

    if (currentArrival && sessionArrival && currentArrival !== sessionArrival) {
      return false;
    }

    return Boolean(
      currentDeparture || sessionDeparture || currentArrival || sessionArrival,
    );
  }

  function updateIdentUI() {
    const buttonEl = document.getElementById(IDENT_BTN_ID);
    if (!buttonEl) return;

    const now = Date.now();
    const pendingRequest = identRequestUntil > now;
    const identActive = identActiveUntil > now;

    buttonEl.disabled = false;
    buttonEl.style.cursor = "pointer";

    if (identActive) {
      const remaining = Math.max(1, Math.ceil((identActiveUntil - now) / 1000));
      buttonEl.textContent = `ACTIVE ${remaining}s`;
      buttonEl.style.borderColor = "rgba(251,191,36,0.45)";
      buttonEl.style.background =
        "linear-gradient(135deg, rgba(251,191,36,0.32), rgba(245,158,11,0.18))";
      buttonEl.style.color = "#fef3c7";
      return;
    }

    if (pendingRequest) {
      const remaining = Math.max(
        1,
        Math.ceil((identRequestUntil - now) / 1000),
      );
      buttonEl.textContent = "CONFIRM";
      buttonEl.style.borderColor = "rgba(251,191,36,0.45)";
      buttonEl.style.background =
        "linear-gradient(135deg, rgba(251,191,36,0.28), rgba(245,158,11,0.14))";
      buttonEl.style.color = "#fef3c7";
      buttonEl.title = `ATC requested IDENT. Confirm within ${remaining}s.`;
      return;
    }

    buttonEl.textContent = "IDENT";
    buttonEl.style.borderColor = "rgba(251,191,36,0.3)";
    buttonEl.style.background = "rgba(251,191,36,0.1)";
    buttonEl.style.color = "#fcd34d";
    buttonEl.title = "Press if ATC asks you to IDENT.";
  }

  function syncFlightPlan() {
    try {
      const g = window.geofs;
      if (!g || !g.flightPlan || typeof g.flightPlan.export !== "function")
        return;

      let waypoints = g.flightPlan.export();
      if (!waypoints) return;
      if (typeof waypoints === "string") waypoints = JSON.parse(waypoints);
      if (!waypoints || waypoints.length < 2) return;

      let depIdent = "";
      let arrIdent = "";

      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        if (wp && wp.type === "DPT" && wp.ident) depIdent = wp.ident;
        if (wp && wp.type === "DST" && wp.ident) arrIdent = wp.ident;
      }

      if (!depIdent) depIdent = (waypoints[0] && waypoints[0].ident) || "";
      if (!arrIdent)
        arrIdent =
          (waypoints[waypoints.length - 1] &&
            waypoints[waypoints.length - 1].ident) ||
          "";

      depIdent = depIdent.toUpperCase();
      arrIdent = arrIdent.toUpperCase();

      const planKey = depIdent + "-" + arrIdent;
      if (planKey === lastSyncedPlan) return;

      const depEl = document.getElementById(DEP_INPUT_ID);
      const arrEl = document.getElementById(ARR_INPUT_ID);
      if (!depEl || !arrEl) return;

      let filled = false;

      if (isICAO(depIdent) && !depEl.value.trim()) {
        depEl.value = depIdent;
        filled = true;
      }

      if (isICAO(arrIdent) && !arrEl.value.trim()) {
        arrEl.value = arrIdent;
        filled = true;
      }

      if (filled) {
        lastSyncedPlan = planKey;
        showToast("Flight plan detected");
      }
    } catch (_) {}
  }

  function validateSquawk(squawk) {
    const rgx = /^\d{4}$/;
    return squawk.length === 0 || rgx.test(squawk);
  }

  function checkFlightNoAvailable(flightNo, myId) {
    return new Promise((resolve) => {
      const es = new EventSource("https://sse.radarthing.com/api/stream");
      const timeout = setTimeout(() => {
        es.close();
        resolve(true);
      }, 5000);

      es.onmessage = (event) => {
        clearTimeout(timeout);
        es.close();
        try {
          const data = JSON.parse(event.data);
          const taken = (data.aircraft || []).some(
            (ac) => ac.flightNo === flightNo && ac.id !== myId,
          );
          resolve(!taken);
        } catch {
          resolve(true);
        }
      };

      es.onerror = () => {
        clearTimeout(timeout);
        es.close();
        resolve(true);
      };
    });
  }

  function showToast(msg, isError = false) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.cssText = `
      position:fixed;
      bottom:20px;
      right:20px;
      background:${isError ? "rgba(239,68,68,0.9)" : "rgba(16,185,129,0.9)"};
      color:#fff;
      padding:12px 16px;
      border-radius:12px;
      font-size:12px;
      font-weight:600;
      letter-spacing:0.05em;
      z-index:1000000;
      opacity:0;
      transition:opacity 0.3s ease;
      box-shadow:0 10px 30px rgba(0,0,0,0.4);
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => (toast.style.opacity = "1"));
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function updateSignInNotice() {
    const notice = document.getElementById(SIGN_IN_NOTICE_ID);
    if (!notice) return;

    notice.style.display = geofs?.userRecord?.googleid ? "none" : "block";
  }

  function fillFlightForm(detail) {
    const depEl = document.getElementById(DEP_INPUT_ID);
    const arrEl = document.getElementById(ARR_INPUT_ID);
    const fltEl = document.getElementById(FLT_INPUT_ID);
    const sqkEl = document.getElementById(SQK_INPUT_ID);
    const afEl = document.getElementById(AF_INPUT_ID);

    if (depEl)
      depEl.value = String(
        detail?.departure || detail?.dep || "",
      ).toUpperCase();
    if (arrEl)
      arrEl.value = String(detail?.arrival || detail?.arr || "").toUpperCase();
    if (fltEl)
      fltEl.value = sanitizeFlightCallsign(
        detail?.flightNo || detail?.flt || "",
      );
    if (sqkEl)
      sqkEl.value = sanitizeSquawk(detail?.squawk || detail?.sqk || "");
    if (afEl) afEl.value = String(detail?.af || "").toUpperCase();
  }

  function ensureResumeFlightModal() {
    let modal = document.getElementById(RESUME_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = RESUME_MODAL_ID;
    modal.style.cssText = `
      position:fixed;
      top:18px;
      left:50%;
      width:min(560px, calc(100vw - 24px));
      display:none;
      transform:translate(-50%, -18px);
      opacity:0;
      transition:
        opacity 0.22s ease,
        transform 0.22s ease;
      z-index:1000004;
    `;

    modal.innerHTML = `
      <div style="
        position:relative;
        overflow:hidden;
        border-radius:20px;
        border:1px solid rgba(103,232,249,0.18);
        background:
          radial-gradient(circle at top right, rgba(34,211,238,0.16), transparent 36%),
          linear-gradient(180deg, rgba(15,23,42,0.97), rgba(2,6,23,0.95));
        box-shadow:0 22px 56px rgba(0,0,0,0.44);
      ">
        <div style="
          position:absolute;
          inset:0;
          pointer-events:none;
          background:
            linear-gradient(135deg, rgba(34,211,238,0.12), transparent 32%),
            linear-gradient(180deg, transparent, rgba(8,47,73,0.16));
        "></div>
        <div style="position:relative; padding:16px 16px 14px;">
          <div style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:12px;
            margin-bottom:12px;
          ">
            <div>
              <div style="
                display:inline-flex;
                align-items:center;
                gap:8px;
                margin-bottom:7px;
                border-radius:999px;
                border:1px solid rgba(34,211,238,0.22);
                background:rgba(8,47,73,0.42);
                padding:5px 9px;
                color:#67e8f9;
                font-size:9px;
                font-weight:700;
                letter-spacing:0.18em;
                text-transform:uppercase;
              ">
                Resume Flight
              </div>
              <div style="
                margin-bottom:4px;
                color:#f8fafc;
                font-size:18px;
                font-weight:700;
                letter-spacing:-0.03em;
              ">Continue your disconnected leg</div>
              <div style="
                color:rgba(226,232,240,0.72);
                font-size:11px;
                line-height:1.45;
              ">
                RadarThing found an interrupted session waiting for you.
              </div>
            </div>
            <button id="radarthing-resume-dismiss" style="
              width:32px;
              height:32px;
              border-radius:999px;
              border:1px solid rgba(148,163,184,0.18);
              background:rgba(15,23,42,0.72);
              color:#94a3b8;
              font-size:16px;
              cursor:pointer;
            ">×</button>
          </div>

          <div style="
            display:grid;
            gap:10px;
            margin-bottom:14px;
          ">
            <div style="
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
              border-radius:16px;
              border:1px solid rgba(148,163,184,0.16);
              background:rgba(15,23,42,0.78);
              padding:12px 14px;
            ">
              <div>
                <div style="margin-bottom:4px; color:#64748b; font-size:9px; letter-spacing:0.16em; text-transform:uppercase;">Callsign</div>
                <div id="radarthing-resume-callsign" style="color:#f8fafc; font-size:15px; font-weight:700;">Unknown</div>
              </div>
              <div style="
                color:#67e8f9;
                font-size:14px;
                font-weight:700;
                letter-spacing:0.16em;
                text-transform:uppercase;
              ">
                <span id="radarthing-resume-departure">---</span>
                <span style="opacity:0.5;"> → </span>
                <span id="radarthing-resume-arrival">---</span>
              </div>
            </div>

            <div style="
              display:grid;
              grid-template-columns:1fr 1fr;
              gap:10px;
            ">
              <div style="
                border-radius:14px;
                border:1px solid rgba(148,163,184,0.16);
                background:rgba(15,23,42,0.68);
                padding:10px 12px;
              ">
                <div style="margin-bottom:4px; color:#64748b; font-size:9px; letter-spacing:0.16em; text-transform:uppercase;">Aircraft</div>
                <div id="radarthing-resume-aircraft" style="color:#f8fafc; font-size:13px; font-weight:700;">Unknown</div>
              </div>
              <div style="
                border-radius:14px;
                border:1px solid rgba(251,191,36,0.16);
                background:linear-gradient(180deg, rgba(120,53,15,0.18), rgba(15,23,42,0.72));
                padding:10px 12px;
              ">
                <div style="margin-bottom:4px; color:#fbbf24; font-size:9px; letter-spacing:0.16em; text-transform:uppercase;">Next Waypoint</div>
                <div id="radarthing-resume-waypoint" style="color:#fef3c7; font-size:13px; font-weight:700;">Unknown</div>
              </div>
            </div>
          </div>

          <div style="display:flex; gap:10px;">
            <button id="radarthing-resume-decline" style="
              flex:1;
              height:38px;
              border-radius:12px;
              border:1px solid rgba(248,113,113,0.24);
              background:rgba(127,29,29,0.22);
              color:#fecaca;
              font-size:10px;
              font-weight:700;
              letter-spacing:0.14em;
              text-transform:uppercase;
              cursor:pointer;
            ">Start fresh</button>
            <button id="radarthing-resume-accept" style="
              flex:1.35;
              height:38px;
              border-radius:12px;
              border:1px solid rgba(34,211,238,0.26);
              background:linear-gradient(135deg, rgba(8,145,178,0.82), rgba(14,116,144,0.92));
              color:#ecfeff;
              font-size:10px;
              font-weight:700;
              letter-spacing:0.14em;
              text-transform:uppercase;
              box-shadow:0 12px 26px rgba(8,145,178,0.24);
              cursor:pointer;
            ">Continue flight</button>
          </div>
        </div>
      </div>
    `;

    const dismissBtn = modal.querySelector("#radarthing-resume-dismiss");
    const declineBtn = modal.querySelector("#radarthing-resume-decline");
    const acceptBtn = modal.querySelector("#radarthing-resume-accept");

    dismissBtn.onclick = () => closeResumeFlightModal(false);
    declineBtn.onclick = () => closeResumeFlightModal(false);
    acceptBtn.onclick = () => closeResumeFlightModal(true);

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && modal.style.display !== "none") {
          closeResumeFlightModal(false);
        }
      },
      true,
    );

    document.body.appendChild(modal);
    return modal;
  }

  function closeResumeFlightModal(shouldResume) {
    const modal = document.getElementById(RESUME_MODAL_ID);
    const resolver = resumeModalResolver;
    resumeModalResolver = null;

    if (!modal) {
      if (resolver) resolver(Boolean(shouldResume));
      return;
    }

    modal.style.opacity = "0";
    modal.style.transform = "translate(-50%, -18px)";

    setTimeout(() => {
      modal.style.display = "none";
      if (resolver) resolver(Boolean(shouldResume));
    }, 220);
  }

  function showResumeFlightModal(detail) {
    const modal = ensureResumeFlightModal();

    modal.querySelector("#radarthing-resume-departure").textContent = String(
      detail?.departure || "???",
    ).toUpperCase();
    modal.querySelector("#radarthing-resume-arrival").textContent = String(
      detail?.arrival || "???",
    ).toUpperCase();
    modal.querySelector("#radarthing-resume-callsign").textContent =
      detail?.flightNo || detail?.callsign || "Unknown";
    modal.querySelector("#radarthing-resume-aircraft").textContent =
      detail?.aircraftType || "Unknown";
    modal.querySelector("#radarthing-resume-waypoint").textContent =
      detail?.nextWaypoint || "Unknown";

    modal.style.display = "flex";
    requestAnimationFrame(() => {
      modal.style.opacity = "1";
      modal.style.transform = "translate(-50%, 0)";
    });

    return new Promise((resolve) => {
      resumeModalResolver = resolve;
    });
  }

  async function maybePromptToResumeFlight() {
    if (resumePromptResolved || !geofs?.userRecord?.googleid) return;

    const hasFilledFlightInfo = Boolean(
      document.getElementById(DEP_INPUT_ID)?.value.trim() ||
      document.getElementById(ARR_INPUT_ID)?.value.trim() ||
      document.getElementById(FLT_INPUT_ID)?.value.trim(),
    );

    try {
      const googleId = String(geofs.userRecord.googleid);
      const res = await fetch(
        `${RESUME_FLIGHT_API}?googleId=${encodeURIComponent(googleId)}`,
      );
      if (!res.ok) return;

      const data = await res.json();
      if (!data?.available || !data.session) {
        resumePromptResolved = true;
        return;
      }

      let shouldResume;
      if (hasFilledFlightInfo) {
        if (!doesSessionMatchCurrentForm(data.session)) {
          resumePromptResolved = true;
          return;
        }
        shouldResume = true;
      } else {
        shouldResume = await showResumeFlightModal(data.session);
      }

      const actionRes = await fetch(RESUME_FLIGHT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: shouldResume ? "claim" : "decline",
          googleId,
          currentId: geofs.userRecord.googleid || geofs.userRecord.callsign,
        }),
      });

      if (!actionRes.ok) {
        showToast("Failed to update disconnected flight", true);
        return;
      }

      const actionData = await actionRes.json().catch(() => null);

      if (!shouldResume) {
        if (!actionData?.finalized) {
          showToast("Failed to end previous disconnected flight", true);
          return;
        }
        showToast("Previous disconnected flight ended");
        resumePromptResolved = true;
        return;
      }

      const resumedSession = actionData?.session || data.session;
      fillFlightForm(resumedSession);
      window.dispatchEvent(
        new CustomEvent("atc-data-sync", {
          detail: {
            dep: resumedSession.departure || "",
            arr: resumedSession.arrival || "",
            flt: resumedSession.flightNo || "",
            sqk: resumedSession.squawk || "",
            af: resumedSession.af || "",
            takeoffTime: resumedSession.takeoffTime || "",
            active: true,
          },
        }),
      );
      showToast("Previous flight resumed");
      resumePromptResolved = true;
    } catch (_) {}
  }

  function startResumePromptPolling() {
    if (resumePromptCheckStarted) return;
    resumePromptCheckStarted = true;

    const interval = setInterval(() => {
      if (!geofs?.userRecord) return;

      maybePromptToResumeFlight().finally(() => {
        if (resumePromptResolved) {
          clearInterval(interval);
        }
      });
    }, 1500);
  }

  function buildInputRow(label, id, placeholder) {
    return `
      <div style="display:flex; gap:8px; align-items:center;">
        <div style="
          width:64px;
          font-size:10px;
          letter-spacing:0.12em;
          color:#94a3b8;
        ">${label}</div>
        <input id="${id}"
          placeholder="${placeholder}"
          maxlength="8"
          autocomplete="off"
          style="
            flex:1;
            height:30px;
            border-radius:8px;
            background:rgba(255,255,255,0.08);
            border:1px solid rgba(255,255,255,0.1);
            color:#e5e7eb;
            padding:0 8px;
            font-size:11px;
            outline:none;
          "
        />
      </div>
    `;
  }

  function buildToggleRow(label, id, checked) {
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:2px 0;">
        <span style="font-size:10px; color:#94a3b8; letter-spacing:0.08em;">${label}</span>
        <div id="${id}" style="
          width:34px; height:18px;
          border-radius:9px;
          background:${checked ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.12)"};
          position:relative;
          cursor:pointer;
          transition:background 0.2s;
        ">
          <div style="
            position:absolute;
            top:2px;
            left:${checked ? "18px" : "2px"};
            width:14px;
            height:14px;
            background:#e5e7eb;
            border-radius:50%;
            transition:left 0.2s;
          "></div>
        </div>
      </div>
    `;
  }

  function updateToggleVisual(id, on) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.background = on
      ? "rgba(34,211,238,0.4)"
      : "rgba(255,255,255,0.12)";
    el.firstElementChild.style.left = on ? "18px" : "2px";
  }

  function saveRadarPrefs() {
    localStorage.setItem(RADAR_PREFS_KEY, JSON.stringify(radarPrefs));
    window.__radarPrefs = radarPrefs;
  }

  // ==========================================
  // AIRPORT CHARTS — Functions
  // ==========================================

  function createEmptyChartsByType() {
    return { TAXI: [], SID: [], STAR: [], APPROACH: [] };
  }

  function loadChartsCacheStorage() {
    try {
      const raw = localStorage.getItem(CHARTS_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveChartsCacheStorage(data) {
    try {
      localStorage.setItem(CHARTS_CACHE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function sanitizeChartsByType(raw) {
    const byType = createEmptyChartsByType();
    if (!raw || typeof raw !== "object") return byType;

    for (const type of CHART_TYPES) {
      const list = Array.isArray(raw[type]) ? raw[type] : [];
      for (const chart of list) {
        if (!chart || !chart.chartName || !chart.chartUrl) continue;
        byType[type].push({
          id:
            chart.id ||
            `${chart.icao || ""}-${type}-${chart.chartName}-${chart.chartUrl}`,
          icao: (chart.icao || "").toUpperCase(),
          chartType: type,
          chartName: chart.chartName,
          chartUrl: chart.chartUrl,
        });
      }
      byType[type].sort((a, b) => a.chartName.localeCompare(b.chartName));
    }

    return byType;
  }

  function normalizeChartRotation(value) {
    const normalized =
      (((Math.round(Number(value || 0) / 90) * 90) % 360) + 360) % 360;
    if (
      normalized === 0 ||
      normalized === 90 ||
      normalized === 180 ||
      normalized === 270
    ) {
      return normalized;
    }
    return 0;
  }

  function loadStoredChartRotations() {
    if (storedChartRotations) return storedChartRotations;

    try {
      const raw = localStorage.getItem(CHARTS_ROTATIONS_KEY);
      if (!raw) {
        storedChartRotations = {};
        return storedChartRotations;
      }

      const parsed = JSON.parse(raw);
      storedChartRotations = Object.fromEntries(
        Object.entries(parsed || {}).map(([chartUrl, rotation]) => [
          chartUrl,
          normalizeChartRotation(rotation),
        ]),
      );
    } catch (_) {
      storedChartRotations = {};
    }

    return storedChartRotations;
  }

  function persistStoredChartRotations(rotations) {
    try {
      localStorage.setItem(CHARTS_ROTATIONS_KEY, JSON.stringify(rotations));
    } catch (_) {}
  }

  function getStoredChartRotation(chartUrl) {
    if (!chartUrl) return 0;
    const rotations = loadStoredChartRotations();
    return rotations[chartUrl] || 0;
  }

  function setStoredChartRotation(chartUrl, rotation) {
    if (!chartUrl) return;

    const normalized = normalizeChartRotation(rotation);
    const rotations = loadStoredChartRotations();

    if (normalized === 0) {
      delete rotations[chartUrl];
    } else {
      rotations[chartUrl] = normalized;
    }

    persistStoredChartRotations(rotations);
  }

  function getNextStoredChartRotation(rotation) {
    return normalizeChartRotation(rotation + 90);
  }

  function syncSelectedChartRotation() {
    const selectedChart = getSelectedChart();
    chartsState.rotation = selectedChart
      ? getStoredChartRotation(selectedChart.chartUrl)
      : 0;
  }

  function getChartRotationScale(width, height, rotation) {
    if (normalizeChartRotation(rotation) % 180 === 0) return 1;
    if (!width || !height) return 1;
    return Math.min(width / height, height / width);
  }

  function clearChartsCacheForAirport(icao) {
    const key = icao.toUpperCase();
    chartsMemoryCache.delete(key);
    const stored = loadChartsCacheStorage();
    if (stored[key]) {
      delete stored[key];
      saveChartsCacheStorage(stored);
    }
  }

  async function fetchChartsForAirport(icao, opts = {}) {
    const upperIcao = icao.toUpperCase();
    const force = !!opts.force;

    if (!force && chartsMemoryCache.has(upperIcao)) {
      return { byType: chartsMemoryCache.get(upperIcao), fromCache: true };
    }

    if (!force) {
      const stored = loadChartsCacheStorage();
      if (stored[upperIcao]) {
        const cachedByType = sanitizeChartsByType(stored[upperIcao]);
        chartsMemoryCache.set(upperIcao, cachedByType);
        return { byType: cachedByType, fromCache: true };
      }
    }

    const res = await fetch(
      `${CHARTS_API}/api/userscript/charts?icao=${encodeURIComponent(upperIcao)}`,
      { headers: { "X-Requested-With": "GeoFS-Charts" } },
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const charts = Array.isArray(data.charts) ? data.charts : [];
    const byType = createEmptyChartsByType();

    for (const chart of charts) {
      if (!chart || !chart.chartType || !byType[chart.chartType]) continue;
      byType[chart.chartType].push({
        id:
          chart.id ||
          `${chart.icao}-${chart.chartType}-${chart.chartName}-${chart.chartUrl}`,
        icao: chart.icao,
        chartType: chart.chartType,
        chartName: chart.chartName,
        chartUrl: chart.chartUrl,
      });
    }

    for (const type of CHART_TYPES) {
      byType[type].sort((a, b) => a.chartName.localeCompare(b.chartName));
    }

    chartsMemoryCache.set(upperIcao, byType);
    const stored = loadChartsCacheStorage();
    stored[upperIcao] = byType;
    saveChartsCacheStorage(stored);

    return { byType, fromCache: false };
  }

  function getChartCount(byType) {
    return CHART_TYPES.reduce((n, t) => n + byType[t].length, 0);
  }

  function getSelectedChart() {
    const charts = chartsState.chartsByType[chartsState.currentType] || [];
    if (!charts.length) return null;
    if (!chartsState.selectedChartId) return charts[0];
    return (
      charts.find((c) => c.id === chartsState.selectedChartId) || charts[0]
    );
  }

  function selectFirstNonEmptyType() {
    for (const type of CHART_TYPES) {
      if (chartsState.chartsByType[type].length > 0) {
        chartsState.currentType = type;
        chartsState.selectedChartId = chartsState.chartsByType[type][0].id;
        return;
      }
    }
    chartsState.currentType = "TAXI";
    chartsState.selectedChartId = null;
  }

  function saveChartsPos(el) {
    try {
      localStorage.setItem(
        CHARTS_POS_KEY,
        JSON.stringify({
          top: parseInt(el.style.top) || CHARTS_DEFAULT_TOP,
          left: parseInt(el.style.left) || CHARTS_DEFAULT_LEFT,
        }),
      );
    } catch (_) {}
  }

  function loadChartsPos() {
    try {
      const s = localStorage.getItem(CHARTS_POS_KEY);
      if (!s) return null;
      const p = JSON.parse(s);
      return {
        top: Math.max(0, Math.min(p.top, window.innerHeight - 100)),
        left: Math.max(0, Math.min(p.left, window.innerWidth - 100)),
      };
    } catch (_) {
      return null;
    }
  }

  function saveChartsSize(el) {
    try {
      const maxHeight = parseInt(el.style.maxHeight, 10);
      localStorage.setItem(
        CHARTS_SIZE_KEY,
        JSON.stringify({
          width: el.offsetWidth,
          maxHeight: Number.isFinite(maxHeight) ? maxHeight : null,
        }),
      );
    } catch (_) {}
  }

  function loadChartsSize() {
    try {
      const s = localStorage.getItem(CHARTS_SIZE_KEY);
      if (!s) return null;
      const p = JSON.parse(s);
      return {
        width: Math.max(300, Math.min(p.width, window.innerWidth - 20)),
        maxHeight: Number.isFinite(p.maxHeight)
          ? Math.max(120, Math.min(p.maxHeight, window.innerHeight - 16))
          : null,
      };
    } catch (_) {
      return null;
    }
  }

  function clampChartsPanelToViewport(panel) {
    if (!panel) return;
    const margin = 8;
    const minWidth = 300;
    const viewportMaxWidth = Math.max(minWidth, window.innerWidth - margin * 2);
    if (panel.offsetWidth > viewportMaxWidth) {
      panel.style.width = viewportMaxWidth + "px";
    }

    if (panel.offsetHeight > window.innerHeight - margin * 2) {
      panel.style.maxHeight =
        Math.max(120, window.innerHeight - margin * 2) + "px";
      panel.style.height = "auto";
    }

    const currentLeft = parseInt(panel.style.left, 10);
    const currentTop = parseInt(panel.style.top, 10);
    const left = Number.isFinite(currentLeft)
      ? currentLeft
      : CHARTS_DEFAULT_LEFT;
    const top = Number.isFinite(currentTop) ? currentTop : CHARTS_DEFAULT_TOP;

    const maxLeft = Math.max(
      margin,
      window.innerWidth - panel.offsetWidth - margin,
    );
    const maxTop = Math.max(
      margin,
      window.innerHeight - panel.offsetHeight - margin,
    );
    panel.style.left = Math.min(Math.max(left, margin), maxLeft) + "px";
    panel.style.top = Math.min(Math.max(top, margin), maxTop) + "px";
  }

  function cacheChartsUi(panel) {
    if (!panel) return null;
    chartsUi.panel = panel;
    chartsUi.title = panel.querySelector(".gc-title");
    chartsUi.typeTabs = panel.querySelector(".gc-type-tabs");
    chartsUi.chartList = panel.querySelector(".gc-list");
    chartsUi.preview = panel.querySelector(".gc-preview");
    chartsUi.invertToggle = panel.querySelector(".gc-invert-toggle");
    chartsUi.rotateToggle = panel.querySelector(".gc-rotate-toggle");
    return chartsUi;
  }

  function requestChartsViewerHeightSync() {
    if (chartsUi.heightFrame) return;
    chartsUi.heightFrame = requestAnimationFrame(() => {
      chartsUi.heightFrame = 0;
      syncChartsViewerHeight();
    });
  }

  function resetChartsPreviewRefs() {
    chartsUi.previewWrap = null;
    chartsUi.previewImg = null;
    chartsUi.previewChartId = null;
  }

  function syncChartsViewerHeight() {
    const panel = chartsUi.panel || document.getElementById(CHARTS_PANEL_ID);
    const preview = chartsUi.preview || panel?.querySelector(".gc-preview");
    if (!panel || !preview) return;

    const img =
      chartsUi.previewImg || preview.querySelector(".gc-image-wrap img");
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) {
      preview.style.height = "0px";
      preview.style.overflow = "hidden";
      panel.style.height = "auto";
      return;
    }

    const nonPreviewHeight = Array.from(panel.children).reduce((sum, child) => {
      if (
        child.classList.contains("gc-preview") ||
        child.classList.contains("gc-resize-handle")
      ) {
        return sum;
      }
      return sum + child.offsetHeight;
    }, 0);

    const horizontalPadding = 28;
    const imageWidth = Math.max(1, panel.clientWidth - horizontalPadding);
    const renderedHeight = Math.round(
      (img.naturalHeight / img.naturalWidth) * imageWidth,
    );
    const rotationScale = getChartRotationScale(
      imageWidth,
      renderedHeight,
      chartsState.rotation,
    );
    const visualHeight =
      chartsState.rotation % 180 === 0
        ? renderedHeight
        : Math.round(imageWidth * rotationScale);
    let maxPreviewHeight = Math.max(
      0,
      window.innerHeight - panel.offsetTop - 16 - nonPreviewHeight,
    );
    const panelMaxHeight = parseInt(panel.style.maxHeight, 10);
    if (Number.isFinite(panelMaxHeight)) {
      maxPreviewHeight = Math.min(
        maxPreviewHeight,
        Math.max(0, panelMaxHeight - nonPreviewHeight),
      );
    }
    const appliedHeight = Math.min(visualHeight, maxPreviewHeight);

    preview.style.height = `${appliedHeight}px`;
    preview.style.overflow = "hidden";
    panel.style.height = "auto";
    if (chartsUi.previewImg) {
      requestAnimationFrame(() => {
        if (chartsUi.previewImg) applyZoom(chartsUi.previewImg);
      });
    }
  }

  function resetChartsZoom() {
    chartsState.zoom = { scale: 1, panX: 0, panY: 0 };
  }

  function getPreviewCursor() {
    return chartsState.zoom.scale > 1 ? "grab" : "";
  }

  function saveChartsIcao(icao) {
    try {
      localStorage.setItem(CHARTS_ICAO_KEY, icao);
    } catch (_) {}
  }

  function loadChartsIcao() {
    try {
      return localStorage.getItem(CHARTS_ICAO_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function makeChartsDraggable(panel, handle) {
    let dragging = false,
      sx,
      sy,
      sl,
      st,
      nextLeft,
      nextTop,
      frame = 0;
    handle.style.cursor = "grab";

    const flushPosition = () => {
      frame = 0;
      panel.style.left = nextLeft + "px";
      panel.style.top = nextTop + "px";
      clampChartsPanelToViewport(panel);
    };

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button") || e.target.closest("input")) return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      sl = parseInt(panel.style.left) || 0;
      st = parseInt(panel.style.top) || 0;
      nextLeft = sl;
      nextTop = st;
      handle.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      nextLeft = sl + e.clientX - sx;
      nextTop = st + e.clientY - sy;
      if (!frame) frame = requestAnimationFrame(flushPosition);
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      if (frame) {
        cancelAnimationFrame(frame);
        flushPosition();
      }
      handle.style.cursor = "grab";
      clampChartsPanelToViewport(panel);
      saveChartsPos(panel);
    });
  }

  function makeChartsResizable(panel) {
    const handles = panel.querySelectorAll(".gc-resize-handle");
    let resizing = false,
      startX,
      startY,
      startW,
      startH,
      resizeType,
      nextWidth,
      nextMaxHeight,
      frame = 0;

    const flushResize = () => {
      frame = 0;
      if (typeof nextWidth === "number") {
        panel.style.width = nextWidth + "px";
      }
      if (typeof nextMaxHeight === "number") {
        panel.style.maxHeight = nextMaxHeight + "px";
      }
      clampChartsPanelToViewport(panel);
      requestChartsViewerHeightSync();
    };

    handles.forEach((handle) => {
      handle.addEventListener("mousedown", (e) => {
        resizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = panel.offsetWidth;
        startH = panel.offsetHeight;
        nextWidth = startW;
        nextMaxHeight = startH;
        if (handle.classList.contains("gc-resize-right")) resizeType = "right";
        else if (handle.classList.contains("gc-resize-bottom"))
          resizeType = "bottom";
        else resizeType = "corner";
        e.preventDefault();
        e.stopPropagation();
      });
    });

    document.addEventListener("mousemove", (e) => {
      if (!resizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (resizeType === "right" || resizeType === "corner") {
        nextWidth = Math.max(300, startW + dx);
      }
      if (resizeType === "bottom" || resizeType === "corner") {
        nextMaxHeight = Math.max(120, startH + dy);
      }
      if (!frame) frame = requestAnimationFrame(flushResize);
    });

    document.addEventListener("mouseup", () => {
      if (!resizing) return;
      resizing = false;
      if (frame) {
        cancelAnimationFrame(frame);
        flushResize();
      }
      clampChartsPanelToViewport(panel);
      requestChartsViewerHeightSync();
      saveChartsSize(panel);
      saveChartsPos(panel);
    });
  }

  function ensureChartsPreview(sel) {
    const preview = chartsUi.preview;
    if (!preview) return;

    if (!sel) {
      if (chartsUi.previewChartId !== null) {
        preview.innerHTML = `<div class="gc-empty">Select a chart from the list above.</div>`;
        resetChartsPreviewRefs();
      }
      requestChartsViewerHeightSync();
      return;
    }

    if (chartsUi.previewChartId !== sel.id || !chartsUi.previewImg) {
      resetChartsZoom();
      preview.innerHTML = `
        <div class="gc-image-wrap">
          <img
            src="${sel.chartUrl}"
            alt="${sel.chartName}"
            draggable="false"
            loading="eager"
            decoding="async"
            fetchpriority="low"
          >
        </div>
      `;
      chartsUi.previewWrap = preview.querySelector(".gc-image-wrap");
      chartsUi.previewImg = preview.querySelector("img");
      chartsUi.previewChartId = sel.id;

      if (chartsUi.previewWrap) {
        chartsUi.previewWrap.style.cursor = getPreviewCursor();
      }

      if (chartsUi.previewImg) {
        chartsUi.previewImg.addEventListener(
          "load",
          requestChartsViewerHeightSync,
        );
        chartsUi.previewImg.addEventListener(
          "error",
          requestChartsViewerHeightSync,
        );
        if (typeof chartsUi.previewImg.decode === "function") {
          chartsUi.previewImg
            .decode()
            .catch(() => {})
            .finally(() => {
              requestChartsViewerHeightSync();
            });
        } else if (chartsUi.previewImg.complete) {
          requestChartsViewerHeightSync();
        }
      }
    }

    if (chartsUi.previewImg) {
      chartsUi.previewImg.classList.toggle(
        "inverted",
        chartsState.invertColors,
      );
      applyZoom(chartsUi.previewImg);
    }
    if (chartsUi.previewWrap) {
      chartsUi.previewWrap.style.cursor = getPreviewCursor();
    }
    requestChartsViewerHeightSync();
  }

  function renderChartsContent() {
    const panel = chartsUi.panel || document.getElementById(CHARTS_PANEL_ID);
    if (!panel) return;

    cacheChartsUi(panel);
    const { title, typeTabs, chartList, preview, invertToggle, rotateToggle } =
      chartsUi;
    if (
      !title ||
      !typeTabs ||
      !chartList ||
      !preview ||
      !invertToggle ||
      !rotateToggle
    ) {
      return;
    }

    const total = getChartCount(chartsState.chartsByType);
    title.textContent = chartsState.currentIcao
      ? `${chartsState.currentIcao} Charts (${total})`
      : "Airport Charts";

    typeTabs.innerHTML = "";
    for (const type of CHART_TYPES) {
      const count = chartsState.chartsByType[type].length;
      const tab = document.createElement("button");
      tab.className = `gc-type-tab${chartsState.currentType === type ? " active" : ""}`;
      tab.innerHTML = `${type}<span>${count}</span>`;
      tab.onclick = () => {
        chartsState.currentType = type;
        const charts = chartsState.chartsByType[type];
        chartsState.selectedChartId = charts.length ? charts[0].id : null;
        renderChartsContent();
      };
      typeTabs.appendChild(tab);
    }

    const currentCharts =
      chartsState.chartsByType[chartsState.currentType] || [];
    chartList.innerHTML = "";

    if (currentCharts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "gc-empty";
      empty.textContent = chartsState.currentIcao
        ? `No ${chartsState.currentType.toLowerCase()} charts available.`
        : "Search an airport to view charts.";
      chartList.appendChild(empty);
    } else {
      const select = document.createElement("select");
      select.className = "gc-select";
      for (const chart of currentCharts) {
        const opt = document.createElement("option");
        opt.value = chart.id;
        opt.textContent = chart.chartName;
        if (chartsState.selectedChartId === chart.id) opt.selected = true;
        select.appendChild(opt);
      }
      select.onchange = () => {
        chartsState.selectedChartId = select.value;
        renderChartsContent();
      };
      ["keydown", "keyup", "keypress"].forEach((evt) => {
        select.addEventListener(evt, (e) => e.stopPropagation());
      });
      chartList.appendChild(select);
    }

    const sel = getSelectedChart();
    syncSelectedChartRotation();
    invertToggle.classList.toggle("active", chartsState.invertColors);
    rotateToggle.disabled = !sel;
    rotateToggle.classList.toggle("disabled", !sel);
    rotateToggle.title = sel
      ? `Rotate chart (${chartsState.rotation}\u00b0)`
      : "Load a chart to rotate it";
    ensureChartsPreview(sel);
  }

  async function chartsSearch(opts = {}) {
    const input = document.getElementById("gc-icao-input");
    const status = document.getElementById("gc-search-status");
    if (!input || !status) return;

    const icao = input.value.trim().toUpperCase();
    if (!icao) {
      status.textContent = "Enter an ICAO code.";
      return;
    }

    status.textContent = "Loading...";
    try {
      const { byType, fromCache } = await fetchChartsForAirport(icao, opts);
      chartsState.currentIcao = icao;
      chartsState.chartsByType = byType;
      saveChartsIcao(icao);
      selectFirstNonEmptyType();
      const total = getChartCount(byType);
      if (total > 0) {
        status.textContent = fromCache
          ? `${total} chart(s) loaded from cache.`
          : `${total} chart(s) loaded from API.`;
      } else {
        status.textContent = fromCache
          ? "No charts found in cache."
          : "No charts found.";
      }
      renderChartsContent();
    } catch (err) {
      console.error("Charts fetch failed:", err);
      status.textContent = "Failed to load charts.";
    }
  }

  function resetChartsAndRefetch() {
    const input = document.getElementById("gc-icao-input");
    const status = document.getElementById("gc-search-status");
    if (!input || !status) return;

    const icao = input.value.trim().toUpperCase();
    if (!icao) {
      status.textContent = "Enter an ICAO code first.";
      return;
    }

    clearChartsCacheForAirport(icao);
    chartsSearch({ force: true });
  }

  function toggleChartsPanel() {
    const panel = document.getElementById(CHARTS_PANEL_ID);
    if (!panel) return;
    const isOpen = panel.style.display !== "none";
    if (isOpen) {
      panel.style.display = "none";
    } else {
      panel.style.display = "flex";
      const input = document.getElementById("gc-icao-input");
      const lastIcao = chartsState.currentIcao || loadChartsIcao();
      if (input) {
        input.value = lastIcao;
        input.focus();
      }
      if (lastIcao && !chartsState.currentIcao) {
        chartsState.currentIcao = lastIcao;
        chartsSearch();
      } else {
        renderChartsContent();
      }
    }
  }

  function hideChartsPanel() {
    const panel = document.getElementById(CHARTS_PANEL_ID);
    if (panel) panel.style.display = "none";
  }

  // ==========================================
  // AIRPORT CHARTS — Zoom & Pan
  // ==========================================

  function applyZoom(img) {
    const { scale, panX, panY } = chartsState.zoom;
    const width = img.clientWidth || img.naturalWidth || 0;
    const height = img.clientHeight || img.naturalHeight || 0;
    const rotationScale = getChartRotationScale(
      width,
      height,
      chartsState.rotation,
    );
    img.style.transform = `translate3d(${panX}px, ${panY}px, 0) rotate(${chartsState.rotation}deg) scale(${scale * rotationScale})`;
    img.style.transformOrigin = "center center";
  }

  function setupChartZoomHandlers() {
    const panel = chartsUi.panel || document.getElementById(CHARTS_PANEL_ID);
    const preview = chartsUi.preview || panel?.querySelector(".gc-preview");
    if (!preview) return;

    let panning = false,
      sx,
      sy,
      frame = 0;

    const flushPan = () => {
      frame = 0;
      if (chartsUi.previewImg) applyZoom(chartsUi.previewImg);
    };

    preview.addEventListener(
      "wheel",
      (e) => {
        const img = chartsUi.previewImg;
        const wrap = chartsUi.previewWrap;
        if (!img || !wrap) return;
        e.preventDefault();

        const previousScale = chartsState.zoom.scale;
        const factor = e.deltaY > 0 ? 0.85 : 1.18;
        const nextScale = Math.max(1, Math.min(10, previousScale * factor));
        if (nextScale <= 1.01) {
          resetChartsZoom();
        } else {
          const rect = wrap.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const localX =
            (e.clientX - centerX - chartsState.zoom.panX) / previousScale;
          const localY =
            (e.clientY - centerY - chartsState.zoom.panY) / previousScale;
          chartsState.zoom.scale = nextScale;
          chartsState.zoom.panX = e.clientX - centerX - localX * nextScale;
          chartsState.zoom.panY = e.clientY - centerY - localY * nextScale;
        }
        applyZoom(img);
        wrap.style.cursor = getPreviewCursor();
      },
      { passive: false },
    );

    preview.addEventListener("mousedown", (e) => {
      const wrap = chartsUi.previewWrap;
      if (!wrap || !wrap.contains(e.target) || chartsState.zoom.scale <= 1)
        return;
      panning = true;
      sx = e.clientX - chartsState.zoom.panX;
      sy = e.clientY - chartsState.zoom.panY;
      wrap.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!panning) return;
      chartsState.zoom.panX = e.clientX - sx;
      chartsState.zoom.panY = e.clientY - sy;
      if (!frame) frame = requestAnimationFrame(flushPan);
    });

    document.addEventListener("mouseup", () => {
      if (!panning) return;
      panning = false;
      if (frame) {
        cancelAnimationFrame(frame);
        flushPan();
      }
      const wrap = chartsUi.previewWrap;
      if (wrap) wrap.style.cursor = getPreviewCursor();
    });

    preview.addEventListener("dblclick", (e) => {
      const wrap = chartsUi.previewWrap;
      if (!wrap || !wrap.contains(e.target)) return;
      resetChartsZoom();
      const img = wrap.querySelector("img");
      if (img) applyZoom(img);
      wrap.style.cursor = "";
    });
  }

  // ==========================================
  // ATC FLIGHT INFO — UI Injection
  // ==========================================

  function injectFlightUI() {
    const isMobile = isMobileBrowser();
    flightUI = document.createElement("div");
    flightUI.id = UI_CONTAINER_ID;
    flightUI.style.cssText = `
      position:fixed;
      top:72px;
      right:16px;
      width:260px;
      max-height:calc(100dvh - 88px);
      overflow-y:auto;
      padding:16px;
      background:rgba(2,6,23,0.75);
      backdrop-filter:blur(18px);
      border:1px solid rgba(255,255,255,0.08);
      border-radius:16px;
      color:#e5e7eb;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Inter",sans-serif;
      box-shadow:0 20px 40px rgba(0,0,0,0.6);
      z-index:999999;
    `;

    const savedFlightUiPosition = loadFlightUiPosition();
    if (savedFlightUiPosition) {
      flightUI.style.left = `${savedFlightUiPosition.left}px`;
      flightUI.style.top = `${savedFlightUiPosition.top}px`;
      flightUI.style.right = "auto";
    }

    flightUI.innerHTML = `
      <div id="${FLIGHT_UI_HEADER_ID}" style="
        position:relative;
        display:flex;
        align-items:center;
        gap:8px;
        margin-bottom:12px;
      ">
        <span style="
          flex:1;
          min-width:0;
          text-align:left;
          font-size:11px;
          letter-spacing:0.14em;
          text-transform:uppercase;
          color:#22d3ee;
          font-weight:600;
          white-space:nowrap;
        ">RadarThing</span>
        <div style="
          display:flex;
          gap:4px;
          flex-shrink:0;
        ">
          <button id="${FLIGHT_UI_MOVE_BTN_ID}" type="button" aria-pressed="false" title="Enable panel moving" style="
            padding:4px 6px;
            border:1px solid rgba(255,255,255,0.12);
            border-radius:6px;
            background:rgba(255,255,255,0.06);
            color:#94a3b8;
            font-size:8px;
            font-weight:600;
            letter-spacing:0.08em;
            line-height:1;
            text-transform:uppercase;
            cursor:pointer;
          ">Move panel</button>
          <button id="${FLIGHT_UI_RESET_BTN_ID}" type="button" title="Reset panel position" style="
            padding:4px 6px;
            border:1px solid rgba(255,255,255,0.12);
            border-radius:6px;
            background:rgba(255,255,255,0.06);
            color:#94a3b8;
            font-size:8px;
            font-weight:600;
            letter-spacing:0.08em;
            line-height:1;
            text-transform:uppercase;
            cursor:pointer;
          ">Reset</button>
        </div>
        ${
          isMobile
            ? `<button id="${MOBILE_UI_CLOSE_ID}" type="button" aria-label="Close ATC flight info" title="Close" style="
                width:28px;
                height:28px;
                display:grid;
                place-items:center;
                padding:0;
                border:0;
                border-radius:8px;
                background:transparent;
                color:#94a3b8;
                font-size:20px;
                font-weight:400;
                line-height:1;
                cursor:pointer;
              ">&times;</button>`
            : ""
        }
      </div>

      <div id="${MOST_TRACKED_BADGE_ID}" role="status" aria-live="polite" style="
        display:none;
        align-items:center;
        gap:9px;
        margin:-2px 0 12px;
        padding:8px 10px;
        border:1px solid rgba(251,191,36,0.32);
        border-radius:10px;
        background:linear-gradient(110deg,rgba(245,158,11,0.16),rgba(251,191,36,0.06));
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);
        color:#fde68a;
      ">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex:none;">
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.8"/>
          <circle cx="12" cy="12" r="2.6" fill="currentColor"/>
        </svg>
        <span style="font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">#1 Most tracked</span>
        <span data-tracker-count style="margin-left:auto;font-size:9px;color:#fbbf24;white-space:nowrap;"></span>
      </div>

      <section id="${ACARS_PANEL_ID}" style="display:none;margin:0 0 14px;padding:10px;border:1px solid rgba(34,211,238,.22);border-radius:10px;background:rgba(8,47,73,.24)">
        <div style="font-size:10px;font-weight:700;letter-spacing:.14em;color:#67e8f9;margin-bottom:7px">ACARS</div>
        <textarea id="${ACARS_DRAFT_ID}" maxlength="500" rows="3" placeholder="Write a flight update for viewers…" aria-label="New ACARS entry" style="box-sizing:border-box;width:100%;resize:vertical;padding:8px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:rgba(2,6,23,.75);color:#fff;font:11px system-ui"></textarea>
        <div style="margin-top:4px;color:#94a3b8;font-size:9px">Visible to viewers until removed.</div>
        <button id="${ACARS_PUBLISH_ID}" type="button" style="width:100%;margin-top:7px;padding:8px;border:1px solid rgba(34,211,238,.35);border-radius:7px;background:rgba(34,211,238,.14);color:#67e8f9;font-size:10px;font-weight:700;cursor:pointer">Publish ACARS</button>
        <div id="${ACARS_LIST_ID}" aria-live="polite" style="margin-top:8px;max-height:160px;overflow-y:auto;color:#cbd5e1;font-size:10px">No ACARS entries yet.</div>
      </section>

      <div style="display:grid; gap:10px;">
        ${buildInputRow("DEP", DEP_INPUT_ID, "ICAO")}
        ${buildInputRow("ARR", ARR_INPUT_ID, "ICAO")}
        ${buildInputRow("CALLSIGN", FLT_INPUT_ID, "ABC123")}
        ${buildInputRow("SQUAWK", SQK_INPUT_ID, "7000")}
      </div>

      <div style="display:flex; gap:8px; margin-top:14px;">
        <button id="${SAVE_BTN_ID}" style="
          flex:1;
          height:36px;
          border-radius:10px;
          border:1px solid rgba(34,211,238,0.3);
          background:rgba(34,211,238,0.15);
          color:#67e8f9;
          font-size:11px;
          font-weight:600;
          letter-spacing:0.12em;
          text-transform:uppercase;
          cursor:pointer;
        ">Save</button>

        <button id="${CLEAR_BTN_ID}" style="
          flex:1;
          height:36px;
          border-radius:10px;
          border:1px solid rgba(239,68,68,0.3);
          background:rgba(239,68,68,0.12);
          color:#fca5a5;
          font-size:11px;
          font-weight:600;
          letter-spacing:0.12em;
          text-transform:uppercase;
          cursor:pointer;
        ">Save/Clear</button>
      </div>

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-top:10px;
        font-size:9px;
        color:#94a3b8;
      ">
        <span>Toggle key</span>
        <button id="${KEYBIND_BTN_ID}" style="
          padding:4px 8px;
          border-radius:6px;
          border:1px solid rgba(255,255,255,0.15);
          background:rgba(255,255,255,0.08);
          color:#e5e7eb;
          font-size:9px;
          letter-spacing:0.12em;
          cursor:pointer;
        ">${toggleKey.toUpperCase()}</button>
      </div>

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-top:6px;
        font-size:9px;
        color:#94a3b8;
      ">
        <span>Charts key</span>
        <button id="${CHARTS_KEYBIND_BTN_ID}" style="
          padding:4px 8px;
          border-radius:6px;
          border:1px solid rgba(255,255,255,0.15);
          background:rgba(255,255,255,0.08);
          color:#e5e7eb;
          font-size:9px;
          letter-spacing:0.12em;
          cursor:pointer;
        ">${chartsToggleKey.toUpperCase()}</button>
      </div>

      <div id="${STATUS_INDICATOR_ID}" style="
        margin-top:8px;
        text-align:center;
        font-size:10px;
        letter-spacing:0.1em;
        text-transform:uppercase;
        color:#f87171;
      ">
        Flight info required
      </div>

      <p id="${SIGN_IN_NOTICE_ID}" style="
        margin:8px 0 0;
        text-align:center;
        font-size:9px;
        line-height:1.45;
        color:#fcd34d;
      ">
        Sign in to GeoFS to appear on the radar. Signed-out flights are not shown.
      </p>

      <div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px;">
        <div id="${RADAR_SETTINGS_HEADER_ID}" style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          cursor:pointer;
          font-size:9px;
          letter-spacing:0.12em;
          text-transform:uppercase;
          color:#94a3b8;
          user-select:none;
        ">
          <span>Radar Settings</span>
          <span id="${RADAR_SETTINGS_ARROW_ID}" style="
            font-size:8px;
            transition:transform 0.2s;
          ">&#9654;</span>
        </div>
        <div id="${RADAR_SETTINGS_BODY_ID}" style="
          display:none;
          margin-top:8px;
          padding:0 2px;
        ">
          ${buildToggleRow("Seabus Radar", SEABUS_TOGGLE_ID, radarPrefs.seabus)}
          <div style="margin-top:6px;">
            ${buildInputRow("AF", AF_INPUT_ID, "USAF")}
          </div>
        </div>
      </div>

      <div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.06); padding-top:10px;">
        <button id="${CHARTS_BTN_ID}" style="
          width:100%;
          height:34px;
          border-radius:10px;
          border:1px solid rgba(34,211,238,0.2);
          background:rgba(34,211,238,0.08);
          color:#22d3ee;
          font-size:10px;
          font-weight:600;
          letter-spacing:0.12em;
          text-transform:uppercase;
          cursor:pointer;
          transition:background 0.15s;
        ">Airport Charts</button>
        <button id="${IDENT_BTN_ID}" style="
          width:100%;
          height:30px;
          margin-top:8px;
          border-radius:10px;
          border:1px solid rgba(251,191,36,0.3);
          background:rgba(251,191,36,0.1);
          color:#fcd34d;
          font-size:9px;
          font-weight:700;
          letter-spacing:0.12em;
          text-transform:uppercase;
          cursor:pointer;
          transition:background 0.15s, border-color 0.15s, color 0.15s;
        " title="Press if ATC asks you to IDENT.">IDENT</button>
      </div>
    `;

    document.body.appendChild(flightUI);
    clampFlightUiToViewport();
    makeFlightUiMovable();
    updateSignInNotice();
    updateAcarsAvailability();
    document.getElementById(ACARS_PUBLISH_ID).addEventListener("click", () => void publishAcars());

    if (isMobile) {
      mobileFlightUIOpenButton = document.createElement("button");
      mobileFlightUIOpenButton.id = MOBILE_UI_OPEN_ID;
      mobileFlightUIOpenButton.type = "button";
      mobileFlightUIOpenButton.setAttribute(
        "aria-label",
        "Open ATC flight info",
      );
      mobileFlightUIOpenButton.title = "Open ATC flight info";
      mobileFlightUIOpenButton.textContent = "‹";
      mobileFlightUIOpenButton.style.cssText = `
        position:fixed;
        top:72px;
        right:12px;
        width:36px;
        height:42px;
        display:none;
        align-items:center;
        justify-content:center;
        padding:0;
        border:1px solid rgba(255,255,255,0.12);
        border-radius:12px;
        background:rgba(2,6,23,0.82);
        backdrop-filter:blur(18px);
        color:#67e8f9;
        font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
        font-size:28px;
        line-height:1;
        box-shadow:0 12px 28px rgba(0,0,0,0.5);
        cursor:pointer;
        z-index:999999;
      `;
      mobileFlightUIOpenButton.onclick = () => setFlightUIVisible(true);
      document.body.appendChild(mobileFlightUIOpenButton);

      document.getElementById(MOBILE_UI_CLOSE_ID).onclick = () =>
        setFlightUIVisible(false);
    }

    [DEP_INPUT_ID, ARR_INPUT_ID, FLT_INPUT_ID, SQK_INPUT_ID].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener("input", () => {
        if (id === FLT_INPUT_ID) {
          el.value = sanitizeFlightCallsign(el.value);
          return;
        }

        if (id === SQK_INPUT_ID) {
          el.value = sanitizeSquawk(el.value);
          return;
        }

        el.value = el.value.toUpperCase();
      });
    });

    document.getElementById(SQK_INPUT_ID).maxLength = 4;

    document.getElementById(KEYBIND_BTN_ID).onclick = () => {
      keybindMode = "flight";
      document.getElementById(KEYBIND_BTN_ID).textContent = "...";
    };

    document.getElementById(CHARTS_KEYBIND_BTN_ID).onclick = () => {
      keybindMode = "charts";
      document.getElementById(CHARTS_KEYBIND_BTN_ID).textContent = "...";
    };

    document.getElementById(RADAR_SETTINGS_HEADER_ID).onclick = () => {
      const body = document.getElementById(RADAR_SETTINGS_BODY_ID);
      const arrow = document.getElementById(RADAR_SETTINGS_ARROW_ID);
      const opening = body.style.display === "none";
      body.style.display = opening ? "grid" : "none";
      body.style.gap = "6px";
      arrow.style.transform = opening ? "rotate(90deg)" : "rotate(0deg)";
    };

    function setupToggle(id, key) {
      document.getElementById(id).onclick = () => {
        radarPrefs[key] = !radarPrefs[key];
        saveRadarPrefs();
        updateToggleVisual(id, radarPrefs[key]);
      };
    }

    setupToggle(SEABUS_TOGGLE_ID, "seabus");

    document.getElementById(SAVE_BTN_ID).onclick = async () => {
      const dep = document.getElementById(DEP_INPUT_ID).value.trim();
      const arr = document.getElementById(ARR_INPUT_ID).value.trim();
      const flt = sanitizeFlightCallsign(
        document.getElementById(FLT_INPUT_ID).value,
      );
      const sqk = sanitizeSquawk(document.getElementById(SQK_INPUT_ID).value);
      const af = document
        .getElementById(AF_INPUT_ID)
        .value.trim()
        .toUpperCase();

      document.getElementById(FLT_INPUT_ID).value = flt;
      document.getElementById(SQK_INPUT_ID).value = sqk;
      document.getElementById(AF_INPUT_ID).value = af;

      if (!dep || !arr || !flt) {
        showToast("Required fields missing", true);
        return;
      }

      if (sqk && !validateSquawk(sqk)) {
        showToast("Invalid squawk", true);
        return;
      }

      const myId = geofs?.userRecord?.googleid || geofs?.userRecord?.callsign;
      const available = await checkFlightNoAvailable(flt, myId);
      if (!available) {
        showToast("Callsign already in use", true);
        return;
      }

      window.dispatchEvent(
        new CustomEvent("atc-data-sync", {
          detail: { dep, arr, flt, sqk, af, active: true },
        }),
      );
      showToast("Flight info saved");
    };

    document.getElementById(CLEAR_BTN_ID).onclick = () => {
      [
        DEP_INPUT_ID,
        ARR_INPUT_ID,
        FLT_INPUT_ID,
        SQK_INPUT_ID,
        AF_INPUT_ID,
      ].forEach((id) => (document.getElementById(id).value = ""));
      window.dispatchEvent(
        new CustomEvent("atc-data-sync", { detail: { active: false } }),
      );
      showToast("Flight info cleared");
    };

    document.getElementById(IDENT_BTN_ID).onclick = () => {
      const durationSeconds =
        identRequestUntil > Date.now() ? identRequestDurationSeconds : 15;
      window.dispatchEvent(
        new CustomEvent("radarthing-ident-confirm", {
          detail: { durationSeconds },
        }),
      );
      identRequestUntil = 0;
      updateIdentUI();
    };

    window.addEventListener("radarthing-flight-disconnected", () => {
      [
        DEP_INPUT_ID,
        ARR_INPUT_ID,
        FLT_INPUT_ID,
        SQK_INPUT_ID,
        AF_INPUT_ID,
      ].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = "";
      });
      showToast("Radar disconnected");
    });

    document.getElementById(CHARTS_BTN_ID).onclick = toggleChartsPanel;

    updateIdentUI();
  }

  // ==========================================
  // AIRPORT CHARTS — UI Injection
  // ==========================================

  function injectChartsCSS() {
    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href =
      "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(fontLink);

    const style = document.createElement("style");
    style.textContent = `
      @keyframes gc-slide-in {
        from { opacity: 0; transform: translateX(12px); }
        to { opacity: 1; transform: translateX(0); }
      }

      #${CHARTS_PANEL_ID} {
        position: fixed;
        z-index: 100002;
        display: none;
        flex-direction: column;
        width: ${CHARTS_DEFAULT_WIDTH}px;
        height: auto;
        max-height: calc(100vh - 16px);
        font-family: 'Figtree', system-ui, sans-serif;
        color: #ffffff;
        background: rgba(1, 11, 16, 0.94);
        border: 1px solid rgba(34, 211, 238, 0.15);
        border-radius: 12px;
        box-shadow:
          0 20px 40px rgba(0, 0, 0, 0.45),
          0 0 1px rgba(0, 0, 0, 0.4),
          0 0 20px rgba(0, 255, 255, 0.04);
        backdrop-filter: blur(16px);
        animation: gc-slide-in 0.2s ease-out;
        overflow: hidden;
      }

      .gc-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        user-select: none;
        flex-shrink: 0;
      }

      .gc-header h3 {
        margin: 0;
        font-family: 'Figtree', system-ui, sans-serif;
        font-size: 0.95rem;
        font-weight: 700;
        color: #22d3ee;
        letter-spacing: -0.01em;
      }

      .gc-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .gc-invert-toggle,
      .gc-rotate-toggle {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: transparent;
        color: rgba(255, 255, 255, 0.4);
        font-family: 'Figtree', system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .gc-invert-toggle:hover,
      .gc-rotate-toggle:hover {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.7);
      }

      .gc-invert-toggle.active {
        background: rgba(34, 211, 238, 0.1);
        border-color: rgba(34, 211, 238, 0.25);
        color: #22d3ee;
      }

      .gc-rotate-toggle.disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .gc-close {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: transparent;
        color: rgba(255, 255, 255, 0.35);
        font-size: 1.15rem;
        line-height: 1;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .gc-close:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        border-color: rgba(255, 255, 255, 0.15);
      }

      .gc-search {
        display: flex;
        gap: 6px;
        padding: 10px 14px 0;
        flex-shrink: 0;
      }

      .gc-search input {
        flex: 1;
        height: 36px;
        border-radius: 7px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.4);
        color: #ffffff;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.85rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        padding: 0 12px;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      .gc-search input::placeholder {
        color: rgba(255, 255, 255, 0.2);
        font-family: 'Figtree', system-ui, sans-serif;
        font-weight: 400;
        letter-spacing: 0;
        text-transform: none;
      }

      .gc-search input:focus {
        border-color: rgba(34, 211, 238, 0.5);
        box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.08);
      }

      .gc-search-btn {
        width: 64px;
        height: 36px;
        border-radius: 7px;
        border: none;
        background: #22d3ee;
        color: #010b10;
        font-family: 'Figtree', system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .gc-search-btn:hover {
        background: #06b6d4;
        box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
      }

      .gc-search-btn:active {
        transform: scale(0.96);
      }

      .gc-reset-btn {
        width: 64px;
        height: 36px;
        border-radius: 7px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.85);
        font-family: 'Figtree', system-ui, sans-serif;
        font-size: 0.74rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .gc-reset-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.22);
      }

      .gc-reset-btn:active {
        transform: scale(0.96);
      }

      .gc-status {
        padding: 0 14px;
        margin-top: 6px;
        min-height: 16px;
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.3);
        flex-shrink: 0;
      }

      .gc-type-tabs {
        display: flex;
        gap: 4px;
        padding: 8px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
      }

      .gc-type-tab {
        flex: 1;
        padding: 6px 2px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: rgba(255, 255, 255, 0.03);
        font-family: 'Figtree', system-ui, sans-serif;
        font-size: 0.65rem;
        font-weight: 600;
        letter-spacing: 0.03em;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
      }

      .gc-type-tab:hover {
        background: rgba(255, 255, 255, 0.07);
        color: rgba(255, 255, 255, 0.7);
      }

      .gc-type-tab span {
        margin-left: 3px;
        opacity: 0.5;
        font-size: 0.6rem;
      }

      .gc-type-tab.active {
        background: rgba(34, 211, 238, 0.15);
        border-color: rgba(34, 211, 238, 0.3);
        color: #22d3ee;
      }

      .gc-type-tab.active span { opacity: 0.7; }

      .gc-list {
        flex-shrink: 0;
        padding: 6px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }

      .gc-select {
        width: 100%;
        height: 32px;
        border-radius: 7px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.4);
        color: #ffffff;
        font-family: 'Figtree', system-ui, sans-serif;
        font-size: 0.76rem;
        font-weight: 500;
        padding: 0 28px 0 10px;
        outline: none;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        transition: border-color 0.15s ease;
      }

      .gc-select:hover {
        border-color: rgba(255, 255, 255, 0.2);
      }

      .gc-select:focus {
        border-color: rgba(34, 211, 238, 0.5);
      }

      .gc-select option {
        background: #0a0f14;
        color: #ffffff;
      }

      .gc-preview::-webkit-scrollbar { width: 4px; }
      .gc-preview::-webkit-scrollbar-track { background: transparent; }
      .gc-preview::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
      }
      .gc-preview::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .gc-empty {
        color: rgba(255, 255, 255, 0.2);
        font-size: 0.76rem;
        padding: 12px 10px;
      }

      .gc-preview {
        flex: none;
        height: 0;
        overflow: hidden;
        padding: 10px 14px 14px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .gc-image-wrap {
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .gc-image-wrap img {
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        display: block;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: #000000;
        transition: transform 0.08s ease-out;
        user-select: none;
        will-change: transform;
      }

      .gc-image-wrap img.inverted {
        filter: invert(1) hue-rotate(180deg) contrast(1.05) saturate(0.95);
      }

      .gc-resize-handle {
        position: absolute;
        z-index: 10;
      }

      .gc-resize-right {
        top: 40px;
        right: -3px;
        width: 6px;
        bottom: 12px;
        cursor: ew-resize;
      }

      .gc-resize-bottom {
        left: 12px;
        right: 12px;
        bottom: -3px;
        height: 6px;
        cursor: ns-resize;
      }

      .gc-resize-corner {
        right: 0;
        bottom: 0;
        width: 16px;
        height: 16px;
        cursor: nwse-resize;
      }

      .gc-resize-corner::after {
        content: '';
        position: absolute;
        right: 4px;
        bottom: 4px;
        width: 8px;
        height: 8px;
        border-right: 2px solid rgba(255, 255, 255, 0.2);
        border-bottom: 2px solid rgba(255, 255, 255, 0.2);
      }

      .gc-resize-corner:hover::after {
        border-color: rgba(34, 211, 238, 0.5);
      }

      @media (max-width: 640px) {
        #${CHARTS_PANEL_ID} {
          width: calc(100vw - 16px);
          height: calc(100vh - 16px);
          max-height: none;
          top: 8px !important;
          left: 8px !important;
        }
        .gc-type-tabs { flex-wrap: wrap; }
        .gc-type-tab {
          flex: 1 1 calc(50% - 2px);
          min-width: calc(50% - 2px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createChartsPanel() {
    if (document.getElementById(CHARTS_PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = CHARTS_PANEL_ID;
    panel.innerHTML = `
      <div class="gc-header">
        <h3 class="gc-title">Airport Charts</h3>
        <div class="gc-header-actions">
          <button class="gc-invert-toggle" title="Toggle color inversion">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>
            Invert
          </button>
          <button class="gc-rotate-toggle" title="Rotate chart">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15A9 9 0 1 1 23 10"/></svg>
            Rotate
          </button>
          <button class="gc-close" title="Close">&times;</button>
        </div>
      </div>
      <div class="gc-search">
        <input id="gc-icao-input" type="text" placeholder="ICAO code..." maxlength="4" spellcheck="false" />
        <button id="gc-search-btn" class="gc-search-btn">Load</button>
        <button id="gc-reset-btn" class="gc-reset-btn">Reset</button>
      </div>
      <div id="gc-search-status" class="gc-status"></div>
      <div class="gc-type-tabs"></div>
      <div class="gc-list"></div>
      <div class="gc-preview"></div>
      <div class="gc-resize-handle gc-resize-right"></div>
      <div class="gc-resize-handle gc-resize-bottom"></div>
      <div class="gc-resize-handle gc-resize-corner"></div>
    `;
    document.body.appendChild(panel);
    cacheChartsUi(panel);

    // Restore position (default: left side)
    const pos = loadChartsPos();
    panel.style.top = (pos ? pos.top : CHARTS_DEFAULT_TOP) + "px";
    panel.style.left = (pos ? pos.left : CHARTS_DEFAULT_LEFT) + "px";

    // Stop clicks from reaching GeoFS
    panel.addEventListener("click", (e) => e.stopPropagation());

    // Restore saved size
    const size = loadChartsSize();
    if (size) {
      panel.style.width = size.width + "px";
      if (size.maxHeight) panel.style.maxHeight = size.maxHeight + "px";
    }
    clampChartsPanelToViewport(panel);

    // Draggable header
    makeChartsDraggable(panel, panel.querySelector(".gc-header"));

    // Resizable edges and corner
    makeChartsResizable(panel);

    // Events
    const input = document.getElementById("gc-icao-input");
    if (input) {
      ["keydown", "keyup", "keypress"].forEach((evt) => {
        input.addEventListener(evt, (e) => e.stopPropagation());
      });
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") chartsSearch();
      });
    }

    document.getElementById("gc-search-btn").onclick = chartsSearch;
    document.getElementById("gc-reset-btn").onclick = resetChartsAndRefetch;
    panel.querySelector(".gc-close").onclick = hideChartsPanel;
    panel.querySelector(".gc-invert-toggle").onclick = () => {
      chartsState.invertColors = !chartsState.invertColors;
      renderChartsContent();
    };
    panel.querySelector(".gc-rotate-toggle").onclick = () => {
      const selectedChart = getSelectedChart();
      if (!selectedChart) return;

      const nextRotation = getNextStoredChartRotation(chartsState.rotation);
      chartsState.rotation = nextRotation;
      setStoredChartRotation(selectedChart.chartUrl, nextRotation);
      renderChartsContent();
    };

    window.addEventListener("resize", () => {
      clampChartsPanelToViewport(panel);
      requestChartsViewerHeightSync();
      saveChartsPos(panel);
      saveChartsSize(panel);
    });
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  window.addEventListener("keydown", (e) => {
    if (keybindMode === "flight") {
      toggleKey = e.key.toLowerCase();
      localStorage.setItem(STORAGE_KEY, toggleKey);
      document.getElementById(KEYBIND_BTN_ID).textContent =
        toggleKey.toUpperCase();
      keybindMode = null;
      showToast("Toggle key updated");
      return;
    }

    if (keybindMode === "charts") {
      chartsToggleKey = e.key.toLowerCase();
      localStorage.setItem(CHARTS_TOGGLE_KEY, chartsToggleKey);
      document.getElementById(CHARTS_KEYBIND_BTN_ID).textContent =
        chartsToggleKey.toUpperCase();
      keybindMode = null;
      showToast("Charts key updated");
      return;
    }

    if (
      e.key.toLowerCase() === toggleKey &&
      e.target.tagName !== "INPUT" &&
      e.target.tagName !== "TEXTAREA"
    ) {
      setFlightUIVisible(flightUI.style.display === "none");
      return;
    }

    if (
      e.key.toLowerCase() === chartsToggleKey &&
      e.target.tagName !== "INPUT" &&
      e.target.tagName !== "TEXTAREA"
    ) {
      toggleChartsPanel();
    }
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.target.tagName === "INPUT") e.stopPropagation();
    },
    true,
  );

  window.addEventListener("atc-status-update", (e) => {
    const statusEl = document.getElementById(STATUS_INDICATOR_ID);
    if (statusEl) {
      statusEl.innerHTML = e.detail.text;
      statusEl.style.color = e.detail.color;
    }
  });

  window.addEventListener("atc-squawk-update", (e) => {
    const sqkEl = document.getElementById(SQK_INPUT_ID);
    if (sqkEl && e.detail.squawk) {
      sqkEl.value = sanitizeSquawk(e.detail.squawk);
    }
  });

  window.addEventListener("atc-data-sync", (e) => {
    const detail = e.detail || {};
    if (detail.active === false) {
      flightActiveForTrackingBadge = false;
      trackingStatusRequestId += 1;
      hideMostTrackedBadge();
      acarsRequestId += 1;
      updateAcarsAvailability();
      return;
    }
    fillFlightForm(detail);
    if (detail.active === true) {
      flightActiveForTrackingBadge = true;
      void refreshMostTrackedBadge();
      updateAcarsAvailability();
      void refreshAcars();
    }
  });

  window.addEventListener("radarthing-ident-requested", (e) => {
    identRequestDurationSeconds = Math.max(
      5,
      Number(e.detail?.durationSeconds) || 15,
    );
    identRequestUntil = Date.now() + IDENT_REQUEST_WINDOW_MS;
    updateIdentUI();
  });

  window.addEventListener("radarthing-ident-update", (e) => {
    identActiveUntil =
      e.detail?.active && Number(e.detail?.identUntil) > Date.now()
        ? Number(e.detail.identUntil)
        : 0;
    if (identActiveUntil > 0) {
      identRequestUntil = 0;
    }
    updateIdentUI();
  });

  // ==========================================
  // INIT
  // ==========================================

  injectFlightUI();
  setInterval(refreshMostTrackedBadge, TRACKING_STATUS_POLL_INTERVAL_MS);
  injectChartsCSS();
  createChartsPanel();
  setupChartZoomHandlers();
  startResumePromptPolling();
  setInterval(syncFlightPlan, 3000);
  setInterval(updateIdentUI, 1000);
  setInterval(updateSignInNotice, 1000);
})();
