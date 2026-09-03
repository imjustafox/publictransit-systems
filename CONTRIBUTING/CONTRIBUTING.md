# Contributing

Thanks for helping improve PublicTransit.Systems. This guide covers the three
most common contributions: fixing data on an existing system, adding a new
system, and wiring up live alerts. The full reference for the data layout and
every config option is in [data/README.md](../data/README.md). Copy-ready
samples of every file you would create by hand live in
[scaffold/](scaffold/).

## Fixing data on an existing system

First check whether the system is generated. If `system.json` has
`"dataSource": "gtfs"`, then `lines.json`, `stations.json`, and
`geometry.json` are rebuilt from the agency's feed every night, and edits to
them will be overwritten. Make your change in `overlay.json` instead: fields
you set there win over the generated values and survive every refresh. If the
system has no `dataSource`, it is maintained by hand and you can edit the
JSON files directly.

If a station or line URL is wrong, the fix usually belongs in `id_map.json`,
which maps feed ids to our slugs. The map is append only: change where a feed
id points, never delete entries.

## Adding a new system from GTFS

Most agencies publish a GTFS feed, and for those the system data is generated
rather than typed in. You create two files by hand and the tooling builds the
rest.

1. Create the system directory with a `system.json` that sets
   `"dataSource": "gtfs"` plus the hand-authored fields (name, location,
   overview, history, stats), and a `gtfs.json` that configures the import.
   Start from the samples in [scaffold/gtfs-system/](scaffold/gtfs-system/).

2. Download a copy of the agency's GTFS zip and seed the system:

   ```bash
   pnpm exec tsx scripts/seed-gtfs.ts --system=your-system --zip=path/to/gtfs.zip
   ```

   This writes `id_map.json`, which pins feed ids to our station and line
   slugs so URLs stay stable across refreshes, and moves hand-authored fields
   into `overlay.json`. Read its report before trusting it; it tells you what
   it could not match.

3. Generate the system and review the output:

   ```bash
   YOUR_SYSTEM_GTFS_URL=... pnpm run build:gtfs -- --system=your-system
   ```

4. Pin anything the feed gets wrong (termini naming, topology, colors) in
   `overlay.json`, regenerate, and repeat until the output looks right. The
   overlay always wins over generated data. Descriptions, history, ridership,
   railcars, and stations or lines the feed does not know about all live
   there too.

5. Add the feed URL as a repository secret and add the system to
   `.github/workflows/gtfs-nightly.yml` so it refreshes nightly.

OSM enrichment runs automatically for every system and adds station
identifiers, accessibility features, and entrances. Set
`"osmEnrichment": false` in `system.json` only if you need to opt out.

## Live alerts from GTFS-RT

Live service alerts and elevator or escalator outages come from the incidents
worker in `workers/incidents`, which polls each agency on a schedule so the
app never talks to an agency directly.

If the agency publishes a GTFS-RT service alerts feed, add a fetcher in
`workers/incidents/src/fetchers.ts` and register it in the `FETCHERS` map in
`workers/incidents/src/index.ts`. The fetcher decodes the protobuf feed and
maps the feed's route and stop ids to our line and station slugs. The RTD
Denver fetcher is a good template: it resolves stops through the system's own
`id_map.json`, so the realtime side reuses the same mappings as the static
import. Feeds that need an API key get a bespoke module under
`workers/incidents/src/systems/` instead; see the WMATA one.

## Systems without a feed

A few agencies publish no GTFS at all. For those, build the JSON files by
hand and leave `dataSource` unset. `beijing-subway` is the reference
example, and [scaffold/hand-system/](scaffold/hand-system/) has samples of
each file. OSM enrichment still covers hand systems: it writes identifiers
and entrances directly into `stations.json` and never touches entrances you
wrote yourself.

## Before you open a pull request

```bash
pnpm run format        # prettier
pnpm run lint          # eslint
pnpm run test          # data pipeline unit tests
pnpm run test:ci       # full build plus accessibility audit
```

Open an issue first if you are unsure whether a change fits, or if you found
a data error you cannot fix yourself.
