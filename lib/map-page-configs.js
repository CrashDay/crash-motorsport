const MAP_PAGE_CONFIGS = {
  sebring: {
    id: "sebring",
    title: "Sebring International Raceway",
    center: [27.4527, -81.3522],
    zoom: 15,
    geoJsonPath: "public/maps/sebring.geojson",
    loadPins: true,
  },
  "daniels-park": {
    id: "daniels-park",
    title: "Daniels Park - Douglas County",
    center: [39.4923, -104.9171],
    zoom: 15,
    geoJsonPath: "public/maps/daniels-park.geojson",
    photoMarkersPath: "data/daniels-photo-markers.json",
    loadPins: false,
  },
  "daytona-road-course": {
    id: "daytona-road-course",
    title: "Daytona International Speedway Road Course",
    center: [29.1856, -81.0694],
    zoom: 15,
    geoJsonPath: "public/maps/daytona-road-course.geojson",
    loadPins: true,
  },
  "laguna-seca": {
    id: "laguna-seca",
    title: "WeatherTech Raceway Laguna Seca",
    center: [36.5844, -121.7532],
    zoom: 16,
    geoJsonPath: "public/maps/laguna-seca.geojson",
    loadPins: true,
  },
};

export function getMapPageConfig(trackId) {
  const normalized = String(trackId || "").trim().toLowerCase();
  return MAP_PAGE_CONFIGS[normalized] || null;
}

export function getMapPageConfigs() {
  return Object.values(MAP_PAGE_CONFIGS);
}
