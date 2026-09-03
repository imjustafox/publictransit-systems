// GTFS reference enums centralized for cross-system standardization.
// Reference: https://gtfs.org/schedule/reference/

export const ROUTE_TYPE = {
  TRAM: 0,
  SUBWAY: 1,
  RAIL: 2,
  BUS: 3,
  FERRY: 4,
  CABLE_TRAM: 5,
  AERIAL_LIFT: 6,
  FUNICULAR: 7,
  TROLLEYBUS: 11,
  MONORAIL: 12,
} as const;

export const RAIL_ROUTE_TYPES = [
  ROUTE_TYPE.TRAM,
  ROUTE_TYPE.SUBWAY,
  ROUTE_TYPE.RAIL,
  ROUTE_TYPE.MONORAIL,
] as const;

export const WHEELCHAIR_BOARDING = {
  NO_INFO: 0,
  ACCESSIBLE: 1,
  NOT_ACCESSIBLE: 2,
} as const;

export const LOCATION_TYPE = {
  STOP: 0,
  STATION: 1,
  ENTRANCE_EXIT: 2,
  GENERIC_NODE: 3,
  BOARDING_AREA: 4,
} as const;
