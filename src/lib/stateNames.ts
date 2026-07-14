// The state GeoJSON (STNAME_SH) and the facility master data use slightly
// different state names. These helpers translate between the two so that
// click-to-filter and the region choropleth work for every state.

const GEO_TO_DATA: Record<string, string> = {
  'Andaman & Nicobar': 'Andaman & Nicobar Islands',
  'Dadra & Nagar Haveli': 'Dadra & Nagar Haveli and Daman & Diu',
  'Daman & Diu': 'Dadra & Nagar Haveli and Daman & Diu',
};

/** GeoJSON state name -> facility-data state name. */
export function geoToDataState(geoName: string): string {
  return GEO_TO_DATA[geoName] ?? geoName;
}

/** Facility-data state name -> GeoJSON state name(s) (a merged UT maps to two polygons). */
export function dataToGeoStates(dataName: string): string[] {
  const geo = Object.entries(GEO_TO_DATA)
    .filter(([, data]) => data === dataName)
    .map(([geoName]) => geoName);
  return geo.length > 0 ? geo : [dataName];
}
