import React from "react";

export const MapGlobalStyles = ({ hideUi = false }: { hideUi?: boolean }) => (
  <style jsx global>{`
    .leaflet-container {
      background: #081722 !important;
    }

    .heading-tooltip {
      background: rgba(0, 10, 15, 0.85) !important;
      color: #00ffff !important;
      border: 1px solid rgba(0, 255, 255, 0.3) !important;
      border-radius: 6px !important;
      padding: 8px 10px !important;
      font-size: 12px !important;
      font-family: monospace !important;
      text-shadow: 0 0 6px rgba(0, 255, 255, 0.7) !important;
      box-shadow: 0 0 10px rgba(0, 255, 255, 0.25) !important;
      pointer-events: none !important;
    }
    .heading-tooltip::before {
      display: none !important;
    }

    .leaflet-popup-content-wrapper {
      background-color: rgba(0, 10, 15, 0.95) !important;
      color: #00ffff !important;
      border: 1px solid rgba(0, 255, 255, 0.25) !important;
      border-radius: 10px !important;
      box-shadow: 0 0 10px rgba(0, 255, 255, 0.15) !important;
      font-family: monospace !important;
      text-shadow: 0 0 5px rgba(0, 255, 255, 0.2) !important;
    }
    .leaflet-popup-tip {
      background-color: rgba(0, 10, 15, 0.95) !important;
      border: 1px solid rgba(0, 255, 255, 0.2) !important;
    }

    .radar-popup .leaflet-popup-content-wrapper {
      background-color: rgba(0, 10, 15, 0.9) !important;
      color: #00ffff !important;
      border: 1px solid #00ffff !important;
      box-shadow: 0 0 10px rgba(0, 255, 255, 0.6) !important;
      animation: radar-glow-pulse 1.4s ease-in-out infinite !important;
    }
    .radar-popup .leaflet-popup-tip {
      background-color: rgba(0, 10, 15, 0.9) !important;
      border-top: 1px solid #00ffff !important;
      border-left: 1px solid transparent !important;
      border-right: 1px solid transparent !important;
    }

    @keyframes radar-glow-pulse {
      0% {
        box-shadow:
          0 0 6px rgba(0, 255, 255, 0.4),
          0 0 10px rgba(0, 255, 255, 0.25);
      }
      50% {
        box-shadow:
          0 0 12px rgba(0, 255, 255, 0.7),
          0 0 20px rgba(0, 255, 255, 0.5);
      }
      100% {
        box-shadow:
          0 0 6px rgba(0, 255, 255, 0.4),
          0 0 10px rgba(0, 255, 255, 0.25);
      }
    }

    @keyframes emergency-plane-pulse {
      0% {
        box-shadow:
          0 0 10px #ff0000,
          0 0 20px #ff0000;
      }
      100% {
        box-shadow:
          0 0 22px #ff0000,
          0 0 35px #ff0000,
          0 0 45px #ff0000;
      }
    }

    @keyframes radar-emergency-pulse {
      0% {
        transform: scale(1);
        box-shadow: 0 0 6px rgba(255, 0, 0, 0.8);
      }
      50% {
        transform: scale(1.2);
        box-shadow: 0 0 14px rgba(255, 0, 0, 1);
      }
      100% {
        transform: scale(1);
        box-shadow: 0 0 6px rgba(255, 0, 0, 0.8);
      }
    }

    @keyframes radar-selected-pulse {
      0% {
        box-shadow:
          0 0 12px rgba(74, 222, 128, 0.9),
          0 0 20px rgba(74, 222, 128, 0.6);
      }
      50% {
        box-shadow:
          0 0 18px rgba(74, 222, 128, 1),
          0 0 30px rgba(74, 222, 128, 0.8);
      }
      100% {
        box-shadow:
          0 0 12px rgba(74, 222, 128, 0.9),
          0 0 20px rgba(74, 222, 128, 0.6);
      }
    }

    @keyframes radar-ring-pulse {
      0% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.7;
        transform: scale(1.15);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }

    .leaflet-aircraft-icon,
    .leaflet-radar-aircraft-icon {
      transition: none !important;
    }

    .leaflet-control-zoom a {
      width: 36px !important;
      height: 36px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 6px !important;
      font-weight: bold !important;
      font-family: monospace !important;
      background: rgba(0, 0, 0, 0.8) !important;
      border: 1px solid rgba(0, 255, 255, 0.3) !important;
      color: #00ffff !important;
      box-shadow: 0 0 6px rgba(0, 255, 255, 0.25) !important;
      transition: all 0.2s ease-in-out !important;
    }
    .leaflet-control-zoom a:hover {
      background: rgba(0, 255, 255, 0.15) !important;
      box-shadow: 0 0 10px rgba(0, 255, 255, 0.5) !important;
      border-color: rgba(0, 255, 255, 0.5) !important;
    }
    .leaflet-control-zoom {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
    }

    /* Position all left-side controls below the header/search bar */
    .leaflet-top.leaflet-left {
      top: 90px !important;
    }

    @media (max-width: 767px) {
      .leaflet-top.leaflet-left {
        top: 60px !important;
      }
    }

    /* Keep the phone map reset action paired with the lower-right dock. */
    .map-control-btn.map-control-mobile-dock[data-control="reset-map-view"] {
      position: fixed !important;
      right: 12px !important;
      bottom: 64px !important;
      margin: 0 !important;
      width: 44px !important;
      height: 44px !important;
    }

    .map-control-mobile-dock[data-control="reset-map-view"] .map-tooltip {
      left: auto;
      right: calc(100% + 8px);
    }

    /* Reduce gap between left-side controls */
    .leaflet-top.leaflet-left .leaflet-control {
      margin-top: 6px !important;
      margin-bottom: 0 !important;
    }

    .leaflet-top.leaflet-left .leaflet-control:first-child {
      margin-top: 0 !important;
    }

    /* Shift precipitation layer to red for better visibility */
    .precipitation-layer {
      filter: hue-rotate(90deg) saturate(1.4);
    }

    .leaflet-rnav-waypoint-icon {
      pointer-events: auto;
    }

    .rnav-waypoint {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 18px;
      white-space: nowrap;
      font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        "Liberation Mono", "Courier New", monospace;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0;
      color: rgba(210, 252, 255, 0.9);
      text-shadow:
        0 0 4px rgba(0, 0, 0, 0.95),
        0 0 8px rgba(0, 255, 255, 0.5);
    }

    .rnav-waypoint-symbol {
      width: 7px;
      height: 7px;
      border: 1px solid rgba(125, 249, 255, 0.95);
      background: rgba(0, 10, 15, 0.78);
      box-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
      transform: rotate(45deg);
    }

    .rnav-waypoint-label {
      padding: 2px 4px;
      border-radius: 3px;
      background: rgba(0, 10, 15, 0.44);
    }

    ${hideUi
      ? `
    .leaflet-top,
    .leaflet-bottom,
    .leaflet-left,
    .leaflet-right,
    .leaflet-control,
    .leaflet-control-container,
    .leaflet-tooltip-pane,
    .leaflet-popup-pane {
      display: none !important;
    }
    `
      : ""}
  `}</style>
);
