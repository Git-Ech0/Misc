# Kilwins Simphony Analytics

A self-contained Chrome (Manifest V3) extension that turns any Oracle Simphony /
Reporting & Analytics report into actionable, plain-English store-management
recommendations — completely offline, with **no portal access required**.

## How it works

1. Click the toolbar icon → the extension's **dashboard** opens in a new tab.
2. **Drag and drop** an `.xlsx` export from the Simphony portal onto the
   dashboard (or click *Choose .xlsx file…*). `.xlsm`, `.xls` and `.csv` are
   also supported.
3. The file is parsed locally with [SheetJS](https://sheetjs.com/), sliced
   into individual report blocks (a single Simphony export can stack
   *Location*, *Day Part*, and *Menu Item* tables in one sheet), and the
   analyzer generates recommendation cards for each block.

The extension never makes a network request. The `.xlsx` file never leaves
your machine.

## Recommendations generated

For weekday-pivoted reports (the *Sales by Weekday* family — `Name | Tuesday
| ... | Sunday | Monday | Week to Date`):

- **Snapshot** — week total, best day, slowest day, items with $0 all week.
- **Staff up / Cut hours** — busiest and slowest weekdays.
- **Sell & make more of these** — top weekly performers, with peak day.
- **Make less of these** — slowest non-zero items.
- **Put these on sale / discount** — bottom-quartile movers.
- **Promote these · One-day wonders** — items where 60%+ of the week's sales
  fell on a single day.
- **Remove or rethink** — items that sold $0 every day this week.
- **Make more on Monday / Tuesday / … / Sunday** — top sellers per day so
  prep can be aligned to actual demand.

For "tall" item-level reports (with separate revenue / quantity / discount /
cost columns), a complementary set of rules fires (top movers, slow movers,
buy more, promote, put on sale, margin alerts, discount watchlist, category
breakdown, snapshot).

Each rule only fires when the relevant columns are present, so different
report shapes surface a different (but appropriate) set of recommendations.

## Install (unpacked)

1. Clone this repo (or download the `kilwins-simphony-analytics/` folder).
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and pick the `kilwins-simphony-analytics/` folder.
5. Click the toolbar icon to open the dashboard, then drop your `.xlsx`
   export onto the page.

## File layout

```
kilwins-simphony-analytics/
├── manifest.json                   # MV3 manifest (permissions: "tabs" only)
├── icons/                          # toolbar / chrome://extensions icons
├── vendor/
│   ├── xlsx.full.min.js            # SheetJS 0.18.5 (Apache-2.0)
│   └── LICENSE-xlsx
├── src/
│   ├── background/
│   │   └── service-worker.js       # opens the dashboard on action click
│   ├── lib/
│   │   ├── dataset.js              # cell parsing + dataset normalization
│   │   ├── sheet-parser.js         # slices one sheet into multiple datasets
│   │   └── analyzer.js             # recommendation engine
│   └── dashboard/
│       ├── dashboard.html          # drag-and-drop UI + report rendering
│       ├── dashboard.css
│       └── dashboard.js
└── tests/
    ├── analyzer.test.mjs           # Node end-to-end test
    └── fixtures/
        └── sales-by-weekday.xlsx   # real Oracle export used by the test
```

## Tests

```bash
# Install xlsx once (only used by the Node test runner):
mkdir -p /tmp/xlsx_node && cd /tmp/xlsx_node && npm install xlsx
cd -

# Run:
NODE_PATH=/tmp/xlsx_node/node_modules \
  node tests/analyzer.test.mjs
```

The suite parses the real `Sales by Weekday.xlsx` export shipped in
`tests/fixtures/`, asserts the sheet parser slices it into 3 analyzable
datasets, and asserts every recommendation rule against the expected
row-1 values for that report (e.g. "Saturday is the busiest day with
$1,588.23", "Top mover is Ice Cream - Scooped at $3,866.55").

## Privacy

100% local. No host permissions, no content scripts, no network access. The
parsed snapshot lives in JS memory only — close the dashboard tab and it is
gone.
