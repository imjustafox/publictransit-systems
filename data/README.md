# How system data works

Each directory under `data/systems/` is one transit system. Most systems are
generated from their agency's GTFS feed and refresh themselves nightly. A few
are maintained by hand because no feed exists for them.

The files in a generated system fall into three layers. Understanding the
layers is the main thing: they decide what a refresh can touch and what it
can never touch.

1. The generated base. `lines.json`, `stations.json`, `geometry.json`, and
   most of `system.json` are built from the feed on every refresh. Do not
   edit these by hand in a generated system. Your edit will be gone by
   morning.
2. `osm.json`, built from OpenStreetMap by the enrichment job. It carries
   station identifiers (`osmId`, `wikidata`), accessibility features, and
   entrances for stations the feed says nothing about. Also regenerated, so
   also not a place for hand edits.
3. `overlay.json`, the hand layer. Everything a human decided lives here:
   descriptions, history, ridership stats, brand colors, opened dates,
   railcars, name preferences, and entire lines or stations that no feed
   knows about. The overlay always wins. A refresh can never overwrite it.

Merge order is base, then OSM, then overlay. If you want to change something
in a generated system, find the field in `overlay.json` and change it there,
or add it there if it is missing. That is the whole trick.

## Editing rules by file

`system.json` is mostly hand data but two fields matter to the machinery:
`dataSource: "gtfs"` opts the system into generation, and
`osmEnrichment: false` opts it out of OSM enrichment (every system is
enriched unless it opts out).

`gtfs.json` configures the feed import:

```jsonc
{
  "static": {
    // Name of the env var / repo secret holding the feed URL. URLs live in
    // secrets so keyed feeds never end up in git.
    "url_secret": "WMATA_GTFS_URL",

    // "none", or a key sent as a query param or header:
    // { "type": "header", "header": "api_key", "value_secret": "WMATA_API_KEY" }
    "auth": { "type": "none" },

    "filters": {
      "route_types": [0, 1, 2], // GTFS route types to keep
      "agency_ids": ["205"], // for multi-agency feeds
      "route_ids_exclude": ["SHUTTLE"], // drop specific routes
      "stop_ids_exclude": ["7649"], // drop non-revenue stops (yards etc.)
    },

    // Collapse several feed routes into one line. BART publishes each
    // direction as its own route; a group of one also works as a rename
    // when the feed's route ids are ugly.
    "route_groups": { "yellow": ["1", "2"] },

    "fields": {
      "line_name_source": "route_short_name", // or "route_long_name"
      "line_color_fallback": "#28813F",
      "stop_grouping": "ifopt", // for German feeds with no parent_station
      "entrances": "gtfs", // only if the feed has location_type 2 stops
    },
  },
}
```

`id_map.json` maps feed ids to our slugs, for stations and lines. It is
append only. Once a feed id maps to a slug, that mapping is permanent, which
is what keeps station URLs stable across refreshes. Several feed ids can map
to the same slug; that is how station complexes like Times Sq work. If a
refresh ever wants to rename something, fix the map, not the output.

`overlay.json` entries come in two kinds. An entry whose id matches a
generated line or station decorates it: the fields you set win over the
generated ones, field by field. An entry whose id matches nothing in the
feed passes through whole, which is how closed stations, future lines, and
services outside the feed survive regeneration. Pass-through entries must be
complete objects (a line needs termini, status, and topology; a station
needs lines, status, and coordinates) or the build fails on purpose.

Two overlay details worth knowing. Arrays replace wholesale, they do not
merge, so an overlay `entrances` list fully replaces whatever was generated.
And when you need to replace a nested object instead of merging into it, set
`"$replace": true` inside it. We use that to pin hand-modeled topology that
the automatic detection gets wrong.

The `totalLines` and `totalStations` numbers in `system.json` are counted
from the merged output on every refresh, so they follow the data on their
own. Pin them in the overlay only when the agency's official count differs
from how we model the system. NYC is the example: the MTA counts 472
stations, we model station complexes, so the overlay pins 472.

## Networks

A system that spans several modes can declare networks in `system.json`:

```jsonc
"networks": [
  { "id": "sounder", "name": "Sounder", "type": "commuter-rail" },
  { "id": "link-light-rail", "name": "Link Light Rail", "type": "light-rail" }
]
```

Every line must then belong to one. Three ways to assign, and the overlay
always wins: a subfeed entry can carry a network (`{ "path":
"2/google_transit.zip", "network": "metro-trains" }`), `gtfs.json` can map
line slugs (`"networks": { "sounder": ["n-line", "s-line"] }`), or an
overlay line entry can set `network` by hand, which is how pass-through
lines get theirs. The build fails if a declared system leaves a line
unassigned.

Networked systems grow a URL level: `/system/network`, with the network's
lines and stations beneath it. Systems without networks keep flat URLs.
A station's networks are derived from its lines and never stored.

Systems whose modes come from separate feed downloads use `sources`
instead of a single `url_secret`:

```jsonc
"sources": [
  { "url_secret": "BALTIMORE_METRO_GTFS_URL", "auth": { "type": "none" }, "network": "metro" },
  { "url_secret": "BALTIMORE_LR_GTFS_URL", "auth": { "type": "none" }, "network": "light-rail" }
]
```

## Adding a new system

If the agency publishes GTFS:

```bash
# 1. Start from the hand files if you have them, or minimal stubs.
mkdir -p data/systems/your-system
# system.json with "dataSource": "gtfs", plus a gtfs.json (see above)

# 2. Seed the id map and overlay from the feed. This matches feed stops to
#    any existing stations by proximity and moves every hand-authored field
#    into the overlay. Read its report before trusting it; it tells you
#    what it could not match.
pnpm exec tsx scripts/seed-gtfs.ts --system=your-system --zip=path/to/gtfs.zip

# 3. Generate and review the diff.
YOUR_SYSTEM_GTFS_URL=... pnpm run build:gtfs -- --system=your-system

# 4. Pin what the feed gets wrong (termini naming, topology) in overlay.json,
#    regenerate, repeat until the output looks right.
```

Then add the feed URL as a repo secret and wire it into
`.github/workflows/gtfs-nightly.yml` so the system refreshes nightly.

If the agency has no GTFS, build the four JSON files by hand the way
`beijing-subway` does and leave `dataSource` unset. OSM enrichment still
covers hand systems: it writes identifiers and entrances directly into
`stations.json`, and never touches entrances you wrote yourself.

## Refresh jobs

`gtfs-nightly.yml` rebuilds every generated system each night. The OSM
refresh runs right after it finishes. Both format the data, run the full
test suite including the accessibility audit, and only then commit. A bad
feed drop opens an issue instead of pushing broken data.

Useful commands:

```bash
pnpm run build:gtfs                     # regenerate every gtfs system
pnpm run build:gtfs -- --system=bart    # just one
pnpm run enrich:osm                     # refresh the OSM layer, all systems
pnpm run enrich:osm -- --system=bart --from-cache
pnpm run test                           # pipeline unit tests
pnpm run test:ci                        # build + accessibility audit
```
