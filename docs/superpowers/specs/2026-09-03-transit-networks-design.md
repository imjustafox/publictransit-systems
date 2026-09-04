# Transit networks: Network/Type/Line/Station hierarchy

Systems can declare named networks (Link Light Rail, Sounder, Metro Trains,
Trams) and their lines file into them. URLs grow a network level for systems
that declare networks; single-mode systems are untouched.

## Data model

- `system.json` gains optional `networks`: array of `{ id, name, type }`.
  `type` is a free mode label ("light-rail", "commuter-rail", "metro",
  "tram", "regional-rail", "bus").
- Each line gains optional `network`: a declared network id.
- Output invariant: if a system declares networks, every line must carry a
  valid network id, else the build fails loud.
- Stations store nothing. A station's networks are derived at read time as
  the union of its lines' networks.

## Pipeline assignment (overlay always wins)

1. `gtfs.json` subfeed entries may be `{ "path": ..., "network": ... }`
   (plain strings stay legal). Routes originating from that subfeed get the
   network. This is Victoria's path: subfeeds 1/2/3 are vline,
   metro-trains, trams.
2. `gtfs.json` gains optional `static.networks`: map of network id to
   post-grouping line slugs, e.g. `{"sounder": ["n-line", "s-line"]}`.
   This is Sound Transit's path.
3. Overlay line entries may set `network` by hand (Stride, hand systems).

## Multi-source systems

`gtfs.json` gains optional `static.sources`: array of
`{ url_secret, auth?, network? }`. Each source is fetched and parsed
independently and the bundles merge with the subfeed merge machinery
(routes/trips/shapes concat, stops dedup by id). This is Baltimore's path:
its two static feeds stay separate downloads. `sources` and the single
`url_secret` form are mutually exclusive.

## Routing (Approach A: keep collection segments)

- New: `/{system}/{network}` landing (network lines + map),
  `/{system}/{network}/lines/{line}`, `/{system}/{network}/stations`,
  `/{system}/{network}/stations/{station}`.
- Station canonical URL is under the network, never a line. A station
  serving several networks canonicalizes to the network of its first line.
- Next static-over-dynamic priority keeps `/{system}/lines` etc. winning
  over `/{system}/[network]`, so flat systems are byte-identical to today.
- For networked systems the flat routes become `permanentRedirect()`
  handlers into the canonical network URL.
- System page for networked systems lists network cards and groups the
  line listing by network. `/{system}/{network}` 404s for undeclared ids.

## System scope in this pass

- **sound-transit**: networks link-light-rail (1-line, 2-line, t-line,
  3-line, 4-line), sounder (n-line, s-line), stride (bus placeholder,
  disabled, network set in overlay).
- **victoria-transit**: metro-trains / trams / vline via subfeed mapping.
- **mta-maryland** (new): replaces baltimore-metro and
  baltimore-light-rail. Networks metro (Metro SubwayLink) and light-rail
  (Light RailLink) via one source per network. Old id maps concatenate;
  station slug collisions between the old systems keep both stations with
  a suffixed slug. Old system URLs redirect: generated per-station
  redirects from the old id maps plus wildcard fallbacks, in next.config.
- Tokyo deferred. Single-mode systems unchanged.

## Incidents worker

Untouched. Worker keeps feed ids baltimore-metro / baltimore-light-rail.
The app maps a networked system to per-network worker feeds: mta-maryland
metro pages read the baltimore-metro worker feed. A networked system's
system-level incident view merges its networks' feeds.

## Testing

- Unit: network assignment from subfeeds / networks map / overlay,
  invariant failure on missing assignment, multi-source merge, derived
  station networks.
- The a11y route walker learns network landings and network-scoped line
  and station pages, so the audit extends automatically.
- Old-URL redirect behavior verified for a line, a station, and the two
  old Baltimore systems.

## Sequencing

Built on the unshipped victoria-transit branch: pipeline fields and
invariant, Sound Transit as proof, Victoria regen, Baltimore merge,
redirects, data/README.md documentation.
