# Scaffold

Copy-ready samples of every file a contributor writes by hand, using a
made-up system called `example-metro`. JSON cannot carry comments, so the
notes live here. The full reference for every option is
[data/README.md](../../data/README.md).

## gtfs-system/

For agencies that publish a GTFS feed. You hand-write only `system.json` and
`gtfs.json`; everything else is generated or seeded.

| File                                           | You write it?  | Notes                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system.json`                                  | yes            | `"dataSource": "gtfs"` opts the system into generation. Hand fields (overview, history, stats) can start here; the seed script moves them into the overlay.                                                                                               |
| `gtfs.json`                                    | yes            | Configures the feed import. The sample shows keyless auth; for a keyed feed use `"auth": { "type": "header", "header": "api_key", "value_secret": "YOUR_SYSTEM_API_KEY" }` as in `data/systems/wmata/gtfs.json`. Feed URLs live in secrets, never in git. |
| `overlay.json`                                 | yes, over time | The hand layer. The sample shows the three entry kinds described below.                                                                                                                                                                                   |
| `id_map.json`                                  | no             | Written by `scripts/seed-gtfs.ts`, append only. Edit only to fix where a feed id points.                                                                                                                                                                  |
| `lines.json`, `stations.json`, `geometry.json` | no             | Generated on every refresh. Hand edits will be overwritten.                                                                                                                                                                                               |
| `osm.json`                                     | no             | Written by the OSM enrichment job.                                                                                                                                                                                                                        |

The sample `overlay.json` demonstrates:

- A **system** section whose fields win over the generated `system.json`.
- A **decorating** line (`red-line`): its id matches a generated line, so the
  fields you set override the generated ones field by field. The `topology`
  object uses `"$replace": true` to swap the whole object instead of merging
  into it, which is how you pin hand-modeled topology.
- A **pass-through** line (`loop-line`) and station (`harbor-west`): their
  ids match nothing in the feed, so they pass through whole. That is how
  future lines and closed stations survive regeneration. Pass-through
  entries must be complete (a line needs termini, status, and topology; a
  station needs lines, status, and coordinates) or the build fails on
  purpose.
- Arrays replace wholesale, they do not merge.

## hand-system/

For agencies with no feed. You write all four files and leave `dataSource`
unset. `data/systems/beijing-subway/` is the real-world reference.

| File            | Notes                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `system.json`   | Same shape as the GTFS variant, minus `dataSource`.                                                                            |
| `lines.json`    | Every line, complete: termini, status, topology, length, station count.                                                        |
| `stations.json` | Every station. OSM enrichment adds `osmId`, `wikidata`, and entrances in place; it never touches entrances you wrote yourself. |
| `railcars.json` | Rolling stock generations with specs. Optional but appreciated.                                                                |
