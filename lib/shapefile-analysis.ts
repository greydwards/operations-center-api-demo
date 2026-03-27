import shp from 'shpjs';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon, FeatureCollection, GeoJsonProperties } from 'geojson';

const SQM_TO_AC = 0.000247105;

export interface HarvestZoneStats {
  irrigatedHarvestedAcres: number;
  drylandHarvestedAcres: number;
  irrigatedAvgYield: number | null;
  drylandAvgYield: number | null;
  irrigatedTotalBushels: number;
  drylandTotalBushels: number;
  irrigatedAvgMoisture: number | null;
  drylandAvgMoisture: number | null;
  harvestPolygonCount: number;
}

/**
 * Parse a shapefile zip buffer into a GeoJSON FeatureCollection.
 */
export async function processShapefile(
  zipBuffer: ArrayBuffer,
): Promise<FeatureCollection> {
  const result = await shp(zipBuffer);

  // shpjs returns an array: [metadata JSON, FeatureCollection, ...]
  // Find the first item that's a GeoJSON FeatureCollection
  if (Array.isArray(result)) {
    const fc = result.find((item: unknown) =>
      item && typeof item === 'object' && 'type' in (item as Record<string, unknown>) && (item as Record<string, unknown>).type === 'FeatureCollection'
    );
    if (fc) return fc as FeatureCollection;
    // Fallback: last item is usually the FeatureCollection
    return result[result.length - 1] as FeatureCollection;
  }
  return result as FeatureCollection;
}

/**
 * Classify harvest polygons as irrigated or dryland based on whether
 * they intersect with interior ring polygons (which represent the pivot/irrigated area).
 */
export function classifyHarvestPolygons(
  harvestGeoJSON: FeatureCollection,
  interiorRingsGeoJSON: Array<{ type: 'Polygon'; coordinates: number[][][] }>,
  irrigated: boolean,
): HarvestZoneStats {
  if (!harvestGeoJSON?.features) {
    return {
      irrigatedHarvestedAcres: 0,
      drylandHarvestedAcres: 0,
      irrigatedAvgYield: null,
      drylandAvgYield: null,
      irrigatedTotalBushels: 0,
      drylandTotalBushels: 0,
      irrigatedAvgMoisture: null,
      drylandAvgMoisture: null,
      harvestPolygonCount: 0,
    };
  }

  let irrigatedArea = 0;
  let drylandArea = 0;
  let irrigatedTotalBushels = 0;
  let drylandTotalBushels = 0;
  const irrigatedYields: number[] = [];
  const drylandYields: number[] = [];
  const irrigatedMoistures: number[] = [];
  const drylandMoistures: number[] = [];

  const interiorFeatures = interiorRingsGeoJSON.map(
    (ring) => turf.feature(ring) as Feature<Polygon>,
  );

  for (const feature of harvestGeoJSON.features) {
    if (!feature.geometry) continue;

    const featureSqm = turf.area(feature);
    const featureAc = featureSqm * SQM_TO_AC;

    const props = feature.properties || {};
    // DBF column names are uppercased in shpjs output
    const yieldVal = props.VRYIELDVOL ?? props.VRYieldVol ?? props.VRYIELDMAS ?? props.VrYieldMas ?? props.GROSSYLDA ?? props.GrossYldA;
    const moistureVal = props.Moisture ?? props.MOISTURE;

    let isIrrigatedPolygon = false;

    if (interiorFeatures.length > 0) {
      for (const interiorFeature of interiorFeatures) {
        try {
          if (turf.booleanIntersects(feature as Feature<Polygon | MultiPolygon>, interiorFeature)) {
            isIrrigatedPolygon = true;
            break;
          }
        } catch {
          // Skip invalid geometries
        }
      }
    } else if (irrigated) {
      isIrrigatedPolygon = true;
    }

    if (isIrrigatedPolygon) {
      irrigatedArea += featureAc;
      if (typeof yieldVal === 'number') {
        irrigatedYields.push(yieldVal);
        // yieldVal is yield per area (bu/ac), multiply by polygon acres to get total bushels
        irrigatedTotalBushels += yieldVal * featureAc;
      }
      if (typeof moistureVal === 'number') irrigatedMoistures.push(moistureVal);
    } else {
      drylandArea += featureAc;
      if (typeof yieldVal === 'number') {
        drylandYields.push(yieldVal);
        drylandTotalBushels += yieldVal * featureAc;
      }
      if (typeof moistureVal === 'number') drylandMoistures.push(moistureVal);
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    irrigatedHarvestedAcres: irrigatedArea,
    drylandHarvestedAcres: drylandArea,
    irrigatedAvgYield: avg(irrigatedYields),
    drylandAvgYield: avg(drylandYields),
    irrigatedTotalBushels,
    drylandTotalBushels,
    irrigatedAvgMoisture: avg(irrigatedMoistures),
    drylandAvgMoisture: avg(drylandMoistures),
    harvestPolygonCount: harvestGeoJSON.features.length,
  };
}

export interface SeedingZoneStats {
  irrigatedSeededAcres: number;
  drylandSeededAcres: number;
  irrigatedAvgSeedingRate: number | null;
  drylandAvgSeedingRate: number | null;
  irrigatedAvgControlRate: number | null;
  drylandAvgControlRate: number | null;
  seedingPolygonCount: number;
}

/**
 * Classify seeding polygons as irrigated or dryland based on whether
 * they intersect with interior ring polygons (pivot/irrigated area).
 */
export function classifySeedingPolygons(
  seedingGeoJSON: FeatureCollection,
  interiorRingsGeoJSON: Array<{ type: 'Polygon'; coordinates: number[][][] }>,
  irrigated: boolean,
): SeedingZoneStats {
  if (!seedingGeoJSON?.features) {
    return {
      irrigatedSeededAcres: 0,
      drylandSeededAcres: 0,
      irrigatedAvgSeedingRate: null,
      drylandAvgSeedingRate: null,
      irrigatedAvgControlRate: null,
      drylandAvgControlRate: null,
      seedingPolygonCount: 0,
    };
  }

  let irrigatedArea = 0;
  let drylandArea = 0;
  const irrigatedRates: number[] = [];
  const drylandRates: number[] = [];
  const irrigatedControlRates: number[] = [];
  const drylandControlRates: number[] = [];

  const interiorFeatures = interiorRingsGeoJSON.map(
    (ring) => turf.feature(ring) as Feature<Polygon>,
  );

  for (const feature of seedingGeoJSON.features) {
    if (!feature.geometry) continue;

    const featureSqm = turf.area(feature);
    const featureAc = featureSqm * SQM_TO_AC;

    const props = feature.properties || {};
    const appliedRate = props.APPLIEDRAT ?? props.AppliedRate ?? props.APPLIEDRATE;
    const controlRate = props.CONTROLRAT ?? props.ControlRate ?? props.TARGETRATE ?? props.TargetRate;

    let isIrrigatedPolygon = false;

    if (interiorFeatures.length > 0) {
      for (const interiorFeature of interiorFeatures) {
        try {
          if (turf.booleanIntersects(feature as Feature<Polygon | MultiPolygon>, interiorFeature)) {
            isIrrigatedPolygon = true;
            break;
          }
        } catch {
          // Skip invalid geometries
        }
      }
    } else if (irrigated) {
      isIrrigatedPolygon = true;
    }

    if (isIrrigatedPolygon) {
      irrigatedArea += featureAc;
      if (typeof appliedRate === 'number') irrigatedRates.push(appliedRate);
      if (typeof controlRate === 'number') irrigatedControlRates.push(controlRate);
    } else {
      drylandArea += featureAc;
      if (typeof appliedRate === 'number') drylandRates.push(appliedRate);
      if (typeof controlRate === 'number') drylandControlRates.push(controlRate);
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    irrigatedSeededAcres: irrigatedArea,
    drylandSeededAcres: drylandArea,
    irrigatedAvgSeedingRate: avg(irrigatedRates),
    drylandAvgSeedingRate: avg(drylandRates),
    irrigatedAvgControlRate: avg(irrigatedControlRates),
    drylandAvgControlRate: avg(drylandControlRates),
    seedingPolygonCount: seedingGeoJSON.features.length,
  };
}
