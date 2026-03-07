"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const danielsParkBounds = [
  [39.435, -104.94],
  [39.462, -104.915],
];

export default function DanielsParkClient() {
  const [geojsonData, setGeojsonData] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadGeoJson() {
      try {
        const res = await fetch("/maps/daniels-park.geojson");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (isMounted) {
          setGeojsonData(data);
        }
      } catch (error) {
        console.error("Failed to load Daniels Park GeoJSON from /maps/daniels-park.geojson", error);
      }
    }

    loadGeoJson();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <MapContainer bounds={danielsParkBounds} boundsOptions={{ padding: [8, 8] }} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {geojsonData && (
          <GeoJSON
            data={geojsonData}
            style={{
              color: "#2563eb",
              weight: 3,
              fillOpacity: 0.12,
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
