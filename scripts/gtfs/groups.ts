import type { GtfsRoute, GtfsTrip } from "./parser";

// Some agencies model each direction (or branch) of a line as its own GTFS
// route - BART publishes Yellow-N and Yellow-S as separate route_ids. A
// route_groups config maps one line id to the member route_ids; this collapses
// the members into a single synthetic route (id = group key) and repoints
// member trips at it, so the rest of the pipeline sees one line per group.
export function applyRouteGroups(
  routes: GtfsRoute[],
  trips: GtfsTrip[],
  groups: Record<string, string[]> | undefined
): { routes: GtfsRoute[]; trips: GtfsTrip[] } {
  if (!groups || Object.keys(groups).length === 0) {
    return { routes, trips };
  }

  const memberToGroup = new Map<string, string>();
  for (const [groupId, members] of Object.entries(groups)) {
    for (const m of members) {
      const existing = memberToGroup.get(m);
      if (existing && existing !== groupId) {
        throw new Error(`route_groups: route ${m} appears in both "${existing}" and "${groupId}"`);
      }
      memberToGroup.set(m, groupId);
    }
  }

  const byId = new Map(routes.map((r) => [r.route_id, r]));
  const groupedRoutes: GtfsRoute[] = [];
  for (const [groupId, members] of Object.entries(groups)) {
    const present = members.filter((m) => byId.has(m));
    if (present.length === 0) continue; // no member in feed: group vanishes
    const first = byId.get(present[0])!;
    groupedRoutes.push({
      ...first,
      route_id: groupId,
      route_short_name: groupId,
      route_long_name: first.route_long_name,
    });
  }

  const ungrouped = routes.filter((r) => !memberToGroup.has(r.route_id));

  const remappedTrips = trips.map((t) =>
    memberToGroup.has(t.route_id) ? { ...t, route_id: memberToGroup.get(t.route_id)! } : t
  );

  return { routes: [...groupedRoutes, ...ungrouped], trips: remappedTrips };
}
