# Page designs

Source artboards for the driver, constructor and race pages, in Claude Design's
`.dc.html` format. Each file is one artboard; `canvas.json` lays them out.

| File | Page |
| --- | --- |
| `Main.dc.html` | Driver profile — `driver.html?d=antonelli` |
| `Constructor.dc.html` | Constructor profile — `constructor.html?c=mercedes` |
| `Race.dc.html` | Race weekend — `race.html?r=16` |
| `DirectionTelemetry.dc.html` | Alternate direction B, low fidelity |
| `DirectionLivery.dc.html` | Alternate direction C, low fidelity |

Published canvas: https://claude.ai/artifact/1xNVkkC3zSdfRMftakVxHY

## Direction

"Paddock" — an editorial almanac rather than a timing screen. Warm paper
(`#F2EFE8`), ink (`#14141A`), hairline rules, Archivo for type and IBM Plex Mono
for figures. The inverse of the current near-black-and-red calendar, chosen
because these pages are mostly dense tables and those read better on light
ground. Team colour is the only accent per page, exposed as a tweak.

## Data

Every figure comes from the live Supabase project, not invented. Two areas are
deliberately marked as unavailable rather than filled in:

- the driver career table needs the 2000–2026 backfill
- past winners at Madrid — 2026 is the circuit's first running

## Regenerating the canvas

The published canvas is built from these files; the seeded output is gitignored.
Re-seed with the `design` skill's helper, passing every `.dc.html` plus
`canvas.json`, then republish to the URL above.
