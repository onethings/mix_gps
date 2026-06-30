// Extend GeoJSON types to make coordinates writable
import 'geojson';

declare module 'geojson' {
  interface Polygon {
    coordinates: number[][][];
  }
  interface MultiPolygon {
    coordinates: number[][][][];
  }
  interface Feature<G extends Geometry | null = Geometry, P = GeoJsonProperties> {
    properties: P;
  }
}
