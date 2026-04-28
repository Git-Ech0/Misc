/*
 * Pure-Node smoke tests for extractor.js + analyzer.js.
 *
 * No external test runner or package.json required.  Run with:
 *   node tests/analyzer.test.mjs
 *
 * We use jsdom-free DOM emulation by loading the lib files (which expose
 * a CommonJS interface when `module.exports` is available) and feeding
 * them a minimal DOM-shaped fixture instead of going through a browser.
 *
 * For HTML/ARIA scraping we ship a tiny inline DOM shim that's just
 * enough for the extractor's querySelector / aria-label / innerText calls.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const Extractor = require(path.join(here, "..", "src", "lib", "extractor.js"));
const Analyzer = require(path.join(here, "..", "src", "lib", "analyzer.js"));

let pass = 0;
let fail = 0;

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  ok  -", name);
  } else {
    fail++;
    console.log("  FAIL-", name, detail ? "\n        " + detail : "");
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// 1. parseCellValue / inferColumnTypes
// ---------------------------------------------------------------------------

console.log("\nparseCellValue:");
{
  const p = Extractor.parseCellValue;
  eq("currency $1,234.56", p("$1,234.56").type, "currency");
  eq("currency value", p("$1,234.56").value, 1234.56);
  eq("paren neg currency", p("($45.00)").value, -45);
  eq("percent 12.5%", p("12.5%").type, "percent");
  eq("percent value", p("12.5%").value, 12.5);
  eq("plain int 42", p("42").type, "number");
  eq("plain int value", p("42").value, 42);
  eq("number with commas", p("1,000,000").value, 1000000);
  eq("weekday", p("Monday").type, "weekday");
  eq("string fallback", p("Mocha Latte").type, "string");
  eq("empty cell", p("—").type, "empty");
}

// ---------------------------------------------------------------------------
// 2. Build a fake dataset directly (skip DOM extraction in node) and run
//    the analyzer against it.
// ---------------------------------------------------------------------------

function buildDataset(headers, rows) {
  const raw = { kind: "html-table", title: "Test report", headers, rows };
  return Extractor.normalizeDataset(raw);
}

console.log("\nSales by Weekday analysis:");
{
  const ds = buildDataset(
    ["Weekday", "Net Sales", "Quantity"],
    [
      ["Monday", "$1,200.00", "300"],
      ["Tuesday", "$1,100.00", "270"],
      ["Wednesday", "$1,500.00", "350"],
      ["Thursday", "$2,400.00", "510"],
      ["Friday", "$3,800.00", "780"],
      ["Saturday", "$4,600.00", "910"],
      ["Sunday", "$2,000.00", "440"],
    ]
  );
  const analysis = Analyzer.analyzeDataset(ds);
  const ids = analysis.insights.map((c) => c.id);
  ok("has summary card", ids.includes("summary"));
  ok("has top-movers card", ids.includes("top-movers"));
  ok("has slow-movers card", ids.includes("slow-movers"));
  ok("has buy-more card", ids.includes("buy-more"));
  ok("has staff-up card", ids.includes("staff-up"));
  ok("has staff-down card", ids.includes("staff-down"));

  const staffUp = analysis.insights.find((c) => c.id === "staff-up");
  ok(
    "Saturday is busiest weekday",
    staffUp.table.rows[0][0] === "Saturday",
    "got: " + JSON.stringify(staffUp.table.rows[0])
  );

  const staffDown = analysis.insights.find((c) => c.id === "staff-down");
  ok(
    "Tuesday is slowest weekday",
    staffDown.table.rows[0][0] === "Tuesday",
    "got: " + JSON.stringify(staffDown.table.rows[0])
  );

  ok(
    "weekday detected as time column",
    analysis.roles.weekday && analysis.roles.weekday.includes("Weekday")
  );
}

console.log("\nMenu Item Sales analysis:");
{
  const ds = buildDataset(
    ["Menu Item", "Quantity Sold", "Net Sales", "Cost", "Discount"],
    [
      ["Caramel Apple",  "120", "$960.00", "$300.00", "$0.00"],
      ["Sea Salt Caramel Bark", "30", "$420.00", "$60.00", "$0.00"],
      ["Tuxedo Fudge",   "80", "$640.00", "$240.00", "$10.00"],
      ["Mackinac Island Fudge", "200", "$1,600.00", "$520.00", "$0.00"],
      ["Almond Butter Toffee",  "12", "$216.00", "$30.00", "$0.00"],
      ["Bear Claw",      "8",  "$80.00", "$28.00", "$0.00"],
      ["Plain Chocolate Bar", "240", "$720.00", "$540.00", "$120.00"],
    ]
  );
  const analysis = Analyzer.analyzeDataset(ds);
  const byId = Object.fromEntries(analysis.insights.map((c) => [c.id, c]));

  ok("has summary",     !!byId["summary"]);
  ok("has top-movers",  !!byId["top-movers"]);
  ok("has slow-movers", !!byId["slow-movers"]);
  ok("has buy-more",    !!byId["buy-more"]);
  ok("has put-on-sale", !!byId["put-on-sale"]);
  ok("has margin-alerts", !!byId["margin-alerts"]);
  ok("has discount-usage", !!byId["discount-usage"]);

  const top = byId["top-movers"].table.rows[0][0];
  ok("Mackinac Island Fudge is top mover", top === "Mackinac Island Fudge",
    "got: " + top);

  const slow = byId["slow-movers"].table.rows[0][0];
  ok("Bear Claw is slowest mover", slow === "Bear Claw", "got: " + slow);

  const margin = byId["margin-alerts"].table.rows[0][0];
  ok("Plain Chocolate Bar has worst margin", margin === "Plain Chocolate Bar",
    "got: " + margin);

  const discount = byId["discount-usage"].table.rows[0][0];
  ok("Plain Chocolate Bar tops discount watchlist", discount === "Plain Chocolate Bar",
    "got: " + discount);
}

console.log("\nNo-revenue dataset still produces something:");
{
  const ds = buildDataset(
    ["Region", "Stores"],
    [["North", "3"], ["South", "5"], ["East", "2"]]
  );
  const analysis = Analyzer.analyzeDataset(ds);
  ok("at least summary card present", analysis.insights.some((c) => c.id === "summary"));
}

// ---------------------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
