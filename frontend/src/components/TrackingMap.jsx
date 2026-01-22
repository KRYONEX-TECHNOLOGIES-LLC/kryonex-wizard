import React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const defaultStyle = "https://demotiles.maplibre.org/style.json";

const toFeatureCollection = (points) => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: points.map((point) => [point.lng, point.lat]),
      },
    },
  ],
});

export default function TrackingMap({ points, center }) {
  const mapRef = React.useRef(null);
  const mapInstance = React.useRef(null);
  const markerRef = React.useRef(null);

  React.useEffect(() => {
    if (mapInstance.current) return;
    if (!mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: defaultStyle,
      center: center || [-82.9988, 39.9612],
      zoom: 11,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    mapInstance.current = map;

    map.on("load", () => {
      map.addSource("track", {
        type: "geojson",
        data: toFeatureCollection(points || []),
      });
      map.addLayer({
        id: "track-line",
        type: "line",
        source: "track",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#22d3ee", "line-width": 4 },
      });
    });
  }, [center, points]);

  React.useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const lastPoint = points?.[points.length - 1];

    if (map.getSource("track")) {
      map.getSource("track").setData(toFeatureCollection(points || []));
    }

    if (lastPoint) {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: "#34d399" })
          .setLngLat([lastPoint.lng, lastPoint.lat])
          .addTo(map);
      } else {
        markerRef.current.setLngLat([lastPoint.lng, lastPoint.lat]);
      }
      map.easeTo({ center: [lastPoint.lng, lastPoint.lat], zoom: 13, duration: 800 });
    }
  }, [points]);

  return <div ref={mapRef} style={{ width: "100%", height: "420px" }} />;
}
