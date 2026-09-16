# Prompt for Claude Design — F1 driver profile page

Copy everything below the line into Claude Design.

---

Design a **driver profile page** for a Formula 1 2026 season web app. Desktop, 1440px wide. Give me **four genuinely different directions**, not four variations of one idea.

## What this page is

One page per driver, reached from a season calendar. It has to work for the championship leader and for a driver who has scored twice — so the layout can't depend on a heroic story existing.

It sits alongside a constructor page and a race-weekend page, sharing a top nav: Calendar · Drivers · Constructors · Races.

## The direction I already have, which I want you to beat

An editorial almanac: warm paper (#F2EFE8), ink-black type, hairline rules, Archivo + IBM Plex Mono, team colour as the only accent, big stat strip, line chart of points, then a race-by-race table.

It is competent and boring. It presents a **database** — hero stats, a chart, a table — when the subject is a **season with a shape to it**. Do not give me that page again in different colours.

## The data is real — use it, don't invent numbers

Kimi Antonelli, #12, Mercedes (livery `#00D7B6`), Italian, leading the 2026 championship after 16 rounds.

**Season totals:** 292 points · 8 wins · 12 podiums · 6 poles · 14 starts · 1 DNF · 57% win rate · 81 points clear of his team-mate.

**Every round — qualified, started, finished:**

| Rd | Grand Prix | Qualified | Started | Finished | Pts | Note |
|----|-----------|-----------|---------|----------|-----|------|
| 1 | Australia | P2 | P2 | P2 | 18 | |
| 2 | China | P1 | P1 | **P1** | 25 | sprint weekend |
| 3 | Japan | P1 | P1 | **P1** | 25 | |
| 6 | Miami | P1 | P1 | **P1** | 25 | sprint weekend |
| 7 | Canada | P2 | P2 | **P1** | 25 | sprint weekend |
| 8 | Monaco | P1 | P1 | **P1** | 25 | |
| 9 | Spain | P3 | P3 | P16 | 0 | **retired** |
| 10 | Austria | P4 | P4 | P3 | 15 | |
| 11 | Britain | P1 | P1 | P15 | 0 | **pole, then nothing** |
| 12 | Belgium | P1 | P1 | **P1** | 25 | |
| 13 | Hungary | P4 | P7 | P3 | 15 | grid penalty |
| 14 | Netherlands | P3 | P3 | P2 | 18 | |
| 15 | Italy | P7 | **P19** | **P1** | 25 | **grid penalty, won from 19th** |
| 16 | Madrid | P2 | P2 | **P1** | 25 | |

Rounds 4 and 5 were cancelled — the season jumps from 3 to 6. A design that assumes contiguous round numbers will break.

**Points after each round:** 18, 47, 72, 100, 131, 156, 156, 171, 179, 204, 219, 242, 267, 292
(The jump from 18 to 47 is 25 + 4 sprint points. Sprint weekends score extra.)

**Championship position after each round:** P2, P2, then P1 for every round since.

**Team-mate:** George Russell, #63, same car — 211 points, 2 wins, 7 podiums, 3 poles. Qualifying head-to-head 9–5 to Antonelli.

**Derived, and more interesting than the totals:**
- Average grid 3.4, average finish 3.5 — nearly identical, despite two results that were nothing like either
- Two zero-point rounds cost roughly 36 points; without them he'd be on ~328
- Biggest gain: +18 places at Monza. Biggest loss: pole to P15 at Silverstone
- Longest win streak: 3 (Miami, Canada, Monaco)

## What I want you to actually explore

Four directions, each built on **one organizing idea you can name in a sentence**. Push on territory a stats table can't reach:

- **The season as a single form.** Not a line chart bolted onto a page — a shape that encodes 14 races at once and is legible in three seconds. Grid-to-finish movement is the richest variable here and almost nobody visualises it.
- **The journey per race.** Qualified → penalised → started → finished is four stages, and the interesting races are where those diverge. Monza and Silverstone are the whole season in two rows.
- **Team-mate as the spine.** Same machinery, two drivers: the only controlled comparison in the sport. A mirrored or diverging structure could carry the page rather than sitting in a sidebar.
- **What it cost.** Points scored against points available. A season told through what was lost is more honest than one told through what was won.
- **Identity as an object.** The car number, the helmet, the livery — F1 has strong graphic identity that a generic profile header throws away.

## Hard constraints

- 1440px desktop. Dense is fine; cramped is not.
- Team colour is the per-page accent (`#00D7B6` here). Also works for Ferrari `#ED1131`, McLaren `#F47600`, Red Bull `#4781D7`, Williams `#00A0DE`, Alpine `#00A1E8`, Haas `#B6BABD` — so don't build a direction that dies on a pale grey.
- The existing app is near-black with F1 red and Formula1 Display type. **Don't match it** — this is a deliberate reset. Equally, don't just invert it to white.
- A **career section** must have a place: eventually seasons 2000–2026, with per-season team, starts, wins, podiums, points, championship position. Right now only 2026 has data, so show how it would look and make the emptiness deliberate rather than accidental.
- Portrait photography is not available yet. Design the identity block so it works without a photo, or with one dropped in later.
- No fabricated numbers. If a direction needs data not listed above, mark it visibly as a placeholder.

## What I don't want

- A hero stat strip over a line chart over a table. That's the page I already have.
- Gradient-heavy "sports app" styling, neon on black, or speed-blur decoration.
- Card grids with rounded corners and a coloured left border.
- Tables that are only tables. If a table earns its place, make it do something a spreadsheet can't.

Give each direction an honest one-line case **and its main trade-off**, so I can pick rather than admire.
