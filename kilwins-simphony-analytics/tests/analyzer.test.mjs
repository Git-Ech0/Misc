// Smoke tests for the offline xlsx pipeline.
//
// Runs end-to-end against the real Sales by Weekday export the user shared:
//   tests/fixtures/sales-by-weekday.xlsx
//
// Usage:
//   node tests/analyzer.test.mjs
// (xlsx must be importable; we install it in /tmp/xlsx_node and rely on
//  NODE_PATH=/tmp/xlsx_node/node_modules)

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FIXTURE = path.join(ROOT, "tests/fixtures/sales-by-weekday.xlsx");

let XLSX;
try {
  XLSX = require("xlsx");
} catch (e) {
  console.error("✖ Could not load 'xlsx'. Install with:");
  console.error("    cd /tmp && mkdir -p xlsx_node && cd xlsx_node && npm install xlsx");
  console.error("  then run with: NODE_PATH=/tmp/xlsx_node/node_modules node tests/analyzer.test.mjs");
  process.exit(1);
}

const Dataset = require(path.join(ROOT, "src/lib/dataset.js"));
const SheetParser = require(path.join(ROOT, "src/lib/sheet-parser.js"));
const Analyzer = require(path.join(ROOT, "src/lib/analyzer.js"));

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    console.log(`  \u2717 ${name}${detail ? "  \u2192 " + detail : ""}`);
  }
}

function suite(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// ---------- parseCellValue ------------------------------------------------

suite("parseCellValue", () => {
  const cases = [
    ["1,588.23", "number", 1588.23],
    ["$1,588.23", "currency", 1588.23],
    ["(45.50)", "currency", -45.5],
    ["12.5%", "percent", 12.5],
    ["Saturday", "weekday", "saturday"],
    ["", "empty", null],
    ["—", "empty", null],
    ["Plain text", "string", "Plain text"],
    ["4/27/2026", "date", null /* not strict */],
  ];
  for (const [raw, type, value] of cases) {
    const c = Dataset.parseCellValue(raw);
    assert(`type(${JSON.stringify(raw)}) === ${type}`, c.type === type, `got ${c.type}`);
    if (value !== null) {
      assert(`value(${JSON.stringify(raw)}) === ${JSON.stringify(value)}`, c.value === value, `got ${c.value}`);
    }
  }
});

// ---------- end-to-end on real xlsx --------------------------------------

const wb = XLSX.readFile(FIXTURE);
const sheet = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
const { datasets, parameters } = SheetParser.parseAOA(aoa, "Sales by Weekday.xlsx");
const analyses = Analyzer.analyzeAll(datasets);

suite("sheet-parser on real Sales+by+Weekday.xlsx", () => {
  assert("captures parameters block (Business Dates etc.)", parameters.length >= 5);
  assert(
    "Business Dates parameter is present",
    parameters.some((p) => p.key === "Business Dates" && /\d/.test(p.value))
  );
  assert("3 analyzable datasets (Location pivot, Day Part pivot, Items)", datasets.length === 3);
  const big = datasets[datasets.length - 1];
  assert("biggest dataset has 250 rows", big.rowCount === 250);
  assert("biggest dataset is wide-weekday", big.kind === "wide-weekday");
  assert(
    "biggest dataset has all 7 weekday columns",
    big.columns.filter((c) => c.isWeekday).length === 7
  );
  assert(
    "biggest dataset has Week to Date column",
    big.headers.some((h) => /week\s*to\s*date/i.test(h))
  );
});

suite("analyzer.analyzeAll · summary card", () => {
  const big = analyses[analyses.length - 1];
  const summary = big.insights.find((i) => i.id === "summary");
  assert("summary card present", !!summary);
  const itemsObj = Object.fromEntries(summary.items.map((i) => [i.label, i.value]));
  assert(`Week total === $6,261.50`, itemsObj["Week total"] === "$6,261.50", itemsObj["Week total"]);
  assert(
    `Best day === Saturday ($1,588.23)`,
    itemsObj["Best day"] === "Saturday ($1,588.23)",
    itemsObj["Best day"]
  );
  assert(
    `Slowest day === Wednesday ($496.35)`,
    itemsObj["Slowest day"] === "Wednesday ($496.35)",
    itemsObj["Slowest day"]
  );
  assert(`Items captured === 249`, itemsObj["Items captured"] === "249", itemsObj["Items captured"]);
  assert(
    `Items with $0 all week === 42`,
    itemsObj["Items with $0 all week"] === "42",
    itemsObj["Items with $0 all week"]
  );
});

suite("analyzer · staffing rules", () => {
  const big = analyses[analyses.length - 1];
  const up = big.insights.find((i) => i.id === "staff-up");
  const down = big.insights.find((i) => i.id === "staff-down");
  assert("staff-up exists", !!up);
  assert("staff-down exists", !!down);
  assert(
    `staff-up row 1 === ['Saturday','$1,588.23']`,
    up.table.rows[0][0] === "Saturday" && up.table.rows[0][1] === "$1,588.23",
    JSON.stringify(up.table.rows[0])
  );
  assert(
    `staff-down row 1 === ['Wednesday','$496.35']`,
    down.table.rows[0][0] === "Wednesday" && down.table.rows[0][1] === "$496.35",
    JSON.stringify(down.table.rows[0])
  );
});

suite("analyzer · top movers / slow movers", () => {
  const big = analyses[analyses.length - 1];
  const top = big.insights.find((i) => i.id === "top-movers");
  const slow = big.insights.find((i) => i.id === "slow-movers");
  assert("top-movers exists", !!top);
  assert("slow-movers exists", !!slow);

  assert(
    "top movers row 1 item === 'Ice Cream - Scooped'",
    top.table.rows[0][0] === "Ice Cream - Scooped",
    top.table.rows[0][0]
  );
  assert(
    "top movers row 1 week total === $3,866.55",
    top.table.rows[0][1] === "$3,866.55",
    top.table.rows[0][1]
  );
  assert(
    "top movers row 1 peak day mentions Saturday",
    /Saturday/.test(top.table.rows[0][2]),
    top.table.rows[0][2]
  );

  assert(
    "slow movers row 1 item === 'Caramel Topping'",
    slow.table.rows[0][0] === "Caramel Topping",
    slow.table.rows[0][0]
  );
  assert(
    "slow movers row 1 days active === '1/7'",
    slow.table.rows[0][2] === "1/7",
    slow.table.rows[0][2]
  );
});

suite("analyzer · zero-movers and put-on-sale", () => {
  const big = analyses[analyses.length - 1];
  const zero = big.insights.find((i) => i.id === "zero-movers");
  assert("zero-movers exists (42 items)", !!zero && zero.title.includes("42"));
  const sale = big.insights.find((i) => i.id === "put-on-sale");
  assert("put-on-sale exists", !!sale);
  assert("put-on-sale lists at least 5 candidates", (sale && sale.table.rows.length) >= 5);
});

suite("analyzer · per-day make-more cards", () => {
  const big = analyses[analyses.length - 1];
  const sat = big.insights.find((i) => i.id === "make-more-saturday");
  assert("make-more-saturday card exists", !!sat);
  assert(
    "Saturday top seller is 'Ice Cream - Scooped' at $1,011.27",
    sat.table.rows[0][0] === "Ice Cream - Scooped" && sat.table.rows[0][1] === "$1,011.27",
    JSON.stringify(sat.table.rows[0])
  );
  const wed = big.insights.find((i) => i.id === "make-more-wednesday");
  assert(
    "Wednesday top seller is 'Ice Cream - Scooped' at $347.58",
    wed && wed.table.rows[0][0] === "Ice Cream - Scooped" && wed.table.rows[0][1] === "$347.58",
    wed && JSON.stringify(wed.table.rows[0])
  );
});

console.log(`\n${passed} passed · ${failed} failed`);
if (failed) {
  for (const f of failures) console.log("  -", f.name, f.detail || "");
  process.exit(1);
}
