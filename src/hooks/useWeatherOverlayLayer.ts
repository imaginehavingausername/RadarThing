import { useEffect, useRef, useState } from "react";
import L from "leaflet";

interface UseWeatherOverlayLayerProps {
  mapInstance: React.MutableRefObject<L.Map | null>;
  mapReady: boolean;
  showPrecipitation: boolean;
  showAirmets: boolean;
  showSigmets: boolean;
}

export const useWeatherOverlayLayer = ({
  mapInstance,
  mapReady,
  showPrecipitation,
  showAirmets,
  showSigmets,
}: UseWeatherOverlayLayerProps) => {
  const precipLayerRef = useRef<L.TileLayer | null>(null);
  const airmetLayerRef = useRef<L.GeoJSON | null>(null);
  const sigmetLayerRef = useRef<L.GeoJSON | null>(null);
  const isigmetLayerRef = useRef<L.GeoJSON | null>(null);

  const [precipitationReady, setPrecipitationReady] = useState(false);
  const [hazardsReadyFor, setHazardsReadyFor] = useState<string | null>(null);
  const hazardKey = `${showAirmets}:${showSigmets}`;

  /* -------------------------------
   * Precipitation (Raster)
   * ------------------------------- */
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current;

    setPrecipitationReady(false);
    let precipitationLayer: L.TileLayer | null = null;
    const markReady = () => setPrecipitationReady(true);
    if (showPrecipitation) {
      if (!precipLayerRef.current) {
        precipLayerRef.current = L.tileLayer(
          "/api/weather/precipitation/{z}/{x}/{y}",
          {
            opacity: 0.8,
            zIndex: 200,
            attribution: "Weather © OpenWeatherMap",
            className: "precipitation-layer",
          },
        );
      }
      precipitationLayer = precipLayerRef.current;
      precipitationLayer.on("load", markReady);
      precipitationLayer.addTo(map);
      if (!precipitationLayer.isLoading()) markReady();
    } else if (precipLayerRef.current) {
      map.removeLayer(precipLayerRef.current);
      precipLayerRef.current = null;
    }
    return () => {
      precipitationLayer?.off("load", markReady);
    };
  }, [mapInstance, mapReady, showPrecipitation]);

  /* -------------------------------
   * AIRMET / SIGMET / ISIGMET
   * ------------------------------- */
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current;

    const styleForHazard = (hazard?: string): L.PathOptions => {
      switch (hazard) {
        case "TURB":
          return { color: "#facc15", weight: 2, fillOpacity: 0.18 };
        case "ICE":
          return { color: "#38bdf8", weight: 2, fillOpacity: 0.18 };
        case "TS":
          return { color: "#ef4444", weight: 2, fillOpacity: 0.22 };
        case "MTW":
          return { color: "#a855f7", weight: 2, fillOpacity: 0.18 };
        default:
          return { color: "#94a3b8", weight: 2, fillOpacity: 0.12 };
      }
    };

    const bindPopup = (feature: any, layer: L.Layer) => {
      const p = feature.properties || {};

      const altLow = p.altitudeLow1 ?? p.altitudeLow ?? p.base;
      const altHi = p.altitudeHi1 ?? p.altitudeHi ?? p.top;
      let altStr = "N/A";
      if (altLow != null && altHi != null) {
        altStr = `FL${Math.round(altLow / 100)} - FL${Math.round(altHi / 100)}`;
      } else if (altLow != null) {
        altStr = `FL${Math.round(altLow / 100)}+`;
      } else if (altHi != null) {
        altStr = `Up to FL${Math.round(altHi / 100)}`;
      }

      const validFrom = p.validTimeFrom ?? p.issueTime;
      const validTo = p.validTimeTo ?? p.expireTime;
      const formatTime = (iso: string | null | undefined) => {
        if (!iso) return "?";
        try {
          return new Date(iso).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
          });
        } catch {
          return iso;
        }
      };

      layer.bindPopup(`
        <strong>${p.hazard || p.airSigmetType || "Advisory"}</strong><br/>
        ${p.rawAirSigmet || p.rawText || ""}<br/><br/>
        <strong>Alt:</strong> ${altStr}<br/>
        <strong>Valid:</strong> ${formatTime(validFrom)} → ${formatTime(validTo)}
      `);
    };

    let isCancelled = false;
    setHazardsReadyFor(null);
    const requests: Promise<void>[] = [];

    const loadLayer = async (
      url: string,
      ref: React.MutableRefObject<L.GeoJSON | null>,
      zIndex: number,
    ) => {
      const res = await fetch(url);
      if (isCancelled) return;

      if (!res.ok) throw new Error(`Weather request failed: ${res.status}`);
      const geojson = await res.json();
      if (isCancelled) return;

      // Verify map is still valid before adding layer
      if (!mapInstance.current?.getPane("overlayPane")) {
        return;
      }

      ref.current = L.geoJSON(geojson, {
        style: (f) => styleForHazard(f?.properties?.hazard),
        onEachFeature: bindPopup,
      });

      ref.current.setZIndex(zIndex);
      ref.current.addTo(mapInstance.current);
    };

    if (showAirmets && !airmetLayerRef.current) {
      requests.push(loadLayer("/api/weather/airmets", airmetLayerRef, 400));
    }
    if (!showAirmets && airmetLayerRef.current) {
      map.removeLayer(airmetLayerRef.current);
      airmetLayerRef.current = null;
    }

    if (showSigmets && !sigmetLayerRef.current) {
      requests.push(loadLayer("/api/weather/sigmets", sigmetLayerRef, 600));
    }
    if (!showSigmets && sigmetLayerRef.current) {
      map.removeLayer(sigmetLayerRef.current);
      sigmetLayerRef.current = null;
    }

    if (showSigmets && !isigmetLayerRef.current) {
      requests.push(loadLayer("/api/weather/isigmets", isigmetLayerRef, 650));
    }
    if (!showSigmets && isigmetLayerRef.current) {
      map.removeLayer(isigmetLayerRef.current);
      isigmetLayerRef.current = null;
    }

    void Promise.all(requests)
      .then(() => {
        if (!isCancelled) setHazardsReadyFor(hazardKey);
      })
      .catch(() => {
        // Keep the overlay up until the page's boot timeout on failure.
      });

    return () => {
      isCancelled = true;
      [airmetLayerRef, sigmetLayerRef, isigmetLayerRef].forEach((ref) => {
        if (ref.current && map) {
          map.removeLayer(ref.current);
          ref.current = null;
        }
      });
    };
  }, [mapInstance, mapReady, showAirmets, showSigmets, hazardKey]);

  return (
    mapReady &&
    (!showPrecipitation || precipitationReady) &&
    hazardsReadyFor === hazardKey
  );
};
