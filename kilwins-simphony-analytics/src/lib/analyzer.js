/*
 * Generic analysis engine for tabular Oracle Simphony data.
 *
 * Input:  one normalized dataset (from sheet-parser.js)
 * Output: an array of "insight cards", each:
 *   {
 *     id: string,
 *     title: string,
 *     subtitle: string,
 *     tone: 'positive' | 'negative' | 'neutral' | 'warning' | 'info',
 *     items: Array<{ label: string, value?: string, detail?: string }>,
 *     // OR a tabular display:
 *     table?: { headers: string[], rows: string[][] }
 *   }
 *
 * Rules are deliberately heuristic and ranked by usefulness so even an
 * unfamiliar Oracle report still produces sensible recommendations.
 */
(function (root) {
  "use strict";

  const Dataset = (typeof require === "function")
    ? require("./dataset.js")
    : (root && root.KilwinsDataset);

  // ---------- column-role inference -----------------------------------------

  // Pattern groups – ranked.  First match wins.
  // Role patterns are checked in declaration order; first match wins.  We
  // use word boundaries to keep unrelated columns ("Discount") from matching
  // partial substrings ("Count").
  const ROLE_PATTERNS = {
    discount: /\b(discount|comp|void|markdown)\b/i,
    revenue: /\b(net\s*sales|gross\s*sales|sales(?!\s*tax)|revenue|net\s*total|total\s*sales|net\s*amount|sales\s*amount|total)\b/i,
    cost: /\b(cogs|food\s*cost|labor\s*cost|expense|cost\s*of\s*sales|item\s*cost|cost)\b/i,
    margin: /\b(margin|profit|gp%?|gross\s*profit)\b/i,
    quantity: /\b(qty|quantity|units?\s*sold|count|sold|served|sales\s*count|item\s*count|orders?|tickets?|checks?|guests?|covers?)\b/i,
    price: /\b(price|avg.*ticket|avg.*check|atv|aov|average)\b/i,
    weekday: /\b(weekday|day\s*of\s*week|dow)\b/i,
    hour: /\b(hour|hr|time\s*of\s*day|tod)\b/i,
    date: /\b(date|day(?!\s*of)|period|week|month|year)\b/i,
    item: /\b(item|menu|product|sku|dish|family|group|category|class|department|tender|payment)\b/i,
  };

  function classifyColumns(columns) {
    const roles = {};
    for (const col of columns) {
      for (const [role, re] of Object.entries(ROLE_PATTERNS)) {
        if (re.test(col.name)) {
          if (!roles[role]) roles[role] = [];
          roles[role].push(col);
          break;
        }
      }
    }
    return roles;
  }

  // ---------- helpers --------------------------------------------------------

  function fmtNumber(n, type) {
    if (n == null || Number.isNaN(n)) return "—";
    if (type === "currency") return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (type === "percent") return n.toFixed(2) + "%";
    if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  function rowMetric(parsedRow, col) {
    if (!col) return null;
    const cell = parsedRow[col.index];
    if (!cell) return null;
    if (cell.type === "number" || cell.type === "currency" || cell.type === "percent") return cell.value;
    return null;
  }

  function rowDimension(parsedRow, dimCols) {
    if (!dimCols || dimCols.length === 0) return "";
    return dimCols
      .map((c) => parsedRow[c.index] && parsedRow[c.index].raw)
      .filter((v) => v && String(v).trim() !== "")
      .join(" · ");
  }

  function rankRowsByMetric(parsedRows, col, dir = "desc") {
    const indexed = parsedRows
      .map((r, i) => ({ i, v: rowMetric(r, col) }))
      .filter((x) => typeof x.v === "number");
    indexed.sort((a, b) => (dir === "asc" ? a.v - b.v : b.v - a.v));
    return indexed;
  }

  function quartile(values, q) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.floor((sorted.length - 1) * q);
    return sorted[idx];
  }

  function pickPrimaryDimension(columns, parsedRows) {
    const dims = columns.filter((c) => c.isDimension);
    if (dims.length === 0) return [];
    // Prefer the first dimension column with high cardinality
    let best = dims[0];
    let bestUnique = 0;
    for (const d of dims) {
      const set = new Set(parsedRows.map((r) => r[d.index] && r[d.index].raw));
      if (set.size > bestUnique) {
        best = d;
        bestUnique = set.size;
      }
    }
    return [best];
  }

  // ---------- insight rules --------------------------------------------------

  function ruleTopMovers(ds, roles, primaryDims) {
    const metric = (roles.revenue && roles.revenue[0]) || (roles.quantity && roles.quantity[0]);
    if (!metric) return null;
    const ranked = rankRowsByMetric(ds.parsedRows, metric, "desc").slice(0, 5);
    if (!ranked.length) return null;
    return {
      id: "top-movers",
      title: "Sell more of these · Top movers",
      subtitle: `Highest ${metric.name}. Lean into them in promotions, displays, and staff training.`,
      tone: "positive",
      table: {
        headers: ["Item", metric.name],
        rows: ranked.map(({ i, v }) => [
          rowDimension(ds.parsedRows[i], primaryDims) || "Row " + (i + 1),
          fmtNumber(v, metric.type),
        ]),
      },
    };
  }

  function ruleSlowMovers(ds, roles, primaryDims) {
    const metric = (roles.revenue && roles.revenue[0]) || (roles.quantity && roles.quantity[0]);
    if (!metric) return null;
    const ranked = rankRowsByMetric(ds.parsedRows, metric, "asc").slice(0, 5);
    if (!ranked.length) return null;
    return {
      id: "slow-movers",
      title: "Make less of these · Slow movers",
      subtitle: `Lowest ${metric.name}. Cut prep volume to reduce waste — or remove from the menu.`,
      tone: "negative",
      table: {
        headers: ["Item", metric.name],
        rows: ranked.map(({ i, v }) => [
          rowDimension(ds.parsedRows[i], primaryDims) || "Row " + (i + 1),
          fmtNumber(v, metric.type),
        ]),
      },
    };
  }

  function ruleBuyMore(ds, roles, primaryDims) {
    const qty = roles.quantity && roles.quantity[0];
    if (!qty) return null;
    const ranked = rankRowsByMetric(ds.parsedRows, qty, "desc").slice(0, 5);
    if (!ranked.length) return null;
    return {
      id: "buy-more",
      title: "Buy more inventory of these",
      subtitle: `Highest ${qty.name}. Make sure stock and ingredients keep up with demand.`,
      tone: "info",
      table: {
        headers: ["Item", qty.name],
        rows: ranked.map(({ i, v }) => [
          rowDimension(ds.parsedRows[i], primaryDims) || "Row " + (i + 1),
          fmtNumber(v, qty.type),
        ]),
      },
    };
  }

  function rulePromote(ds, roles, primaryDims) {
    const rev = roles.revenue && roles.revenue[0];
    const qty = roles.quantity && roles.quantity[0];
    if (!rev || !qty) return null;

    const meanRev = rev.mean;
    const meanQty = qty.mean;
    if (meanRev == null || meanQty == null || meanQty === 0) return null;

    const meanRevPerUnit = meanRev / meanQty;
    const candidates = ds.parsedRows
      .map((r, i) => {
        const rv = rowMetric(r, rev);
        const qv = rowMetric(r, qty);
        if (typeof rv !== "number" || typeof qv !== "number" || qv <= 0) return null;
        const rpu = rv / qv;
        return { i, rv, qv, rpu };
      })
      .filter(Boolean)
      // High revenue per unit but selling below average qty → likely under-promoted high-margin items
      .filter((x) => x.rpu > meanRevPerUnit * 1.15 && x.qv < meanQty)
      .sort((a, b) => b.rpu - a.rpu)
      .slice(0, 5);

    if (!candidates.length) return null;
    return {
      id: "promote",
      title: "Promote these · High value, under-selling",
      subtitle: `These items earn more per unit than average but aren't moving — try upselling, bundling, or featuring them.`,
      tone: "info",
      table: {
        headers: ["Item", "Per-unit value", "Units"],
        rows: candidates.map(({ i, rpu, qv }) => [
          rowDimension(ds.parsedRows[i], primaryDims) || "Row " + (i + 1),
          fmtNumber(rpu, rev.type),
          fmtNumber(qv, qty.type),
        ]),
      },
    };
  }

  function rulePutOnSale(ds, roles, primaryDims) {
    const qty = roles.quantity && roles.quantity[0];
    const rev = roles.revenue && roles.revenue[0];
    if (!qty) return null;

    const qtyValues = ds.parsedRows
      .map((r) => rowMetric(r, qty))
      .filter((v) => typeof v === "number");
    if (qtyValues.length < 4) return null;

    const q1 = quartile(qtyValues, 0.25);
    if (q1 == null) return null;

    const candidates = ds.parsedRows
      .map((r, i) => {
        const qv = rowMetric(r, qty);
        const rv = rev ? rowMetric(r, rev) : null;
        return { i, qv, rv };
      })
      .filter((x) => typeof x.qv === "number" && x.qv > 0 && x.qv <= q1)
      .sort((a, b) => a.qv - b.qv)
      .slice(0, 5);

    if (!candidates.length) return null;
    return {
      id: "put-on-sale",
      title: "Put these on sale / discount",
      subtitle: `Bottom-quartile movers — discount, bundle, or feature to clear product before waste.`,
      tone: "warning",
      table: {
        headers: rev ? ["Item", qty.name, rev.name] : ["Item", qty.name],
        rows: candidates.map(({ i, qv, rv }) => {
          const row = [rowDimension(ds.parsedRows[i], primaryDims) || "Row " + (i + 1), fmtNumber(qv, qty.type)];
          if (rev) row.push(fmtNumber(rv, rev.type));
          return row;
        }),
      },
    };
  }

  function ruleMarginAlerts(ds, roles, primaryDims) {
    const rev = roles.revenue && roles.revenue[0];
    const cost = roles.cost && roles.cost[0];
    if (!rev || !cost) return null;
    const items = ds.parsedRows
      .map((r, i) => {
        const rv = rowMetric(r, rev);
        const cv = rowMetric(r, cost);
        if (typeof rv !== "number" || typeof cv !== "number" || rv <= 0) return null;
        const margin = (rv - cv) / rv;
        return { i, rv, cv, margin };
      })
      .filter(Boolean);

    if (!items.length) return null;
    items.sort((a, b) => a.margin - b.margin);
    const worst = items.slice(0, 5);
    if (!worst.length) return null;
    return {
      id: "margin-alerts",
      title: "Margin alerts · Lowest profit items",
      subtitle: `Items where (${rev.name} − ${cost.name}) / ${rev.name} is smallest. Re-price or re-source.`,
      tone: "negative",
      table: {
        headers: ["Item", "Margin", rev.name, cost.name],
        rows: worst.map(({ i, rv, cv, margin }) => [
          rowDimension(ds.parsedRows[i], primaryDims) || "Row " + (i + 1),
          (margin * 100).toFixed(1) + "%",
          fmtNumber(rv, rev.type),
          fmtNumber(cv, cost.type),
        ]),
      },
    };
  }

  function ruleDiscountUsage(ds, roles, primaryDims) {
    const disc = roles.discount && roles.discount[0];
    const rev = roles.revenue && roles.revenue[0];
    if (!disc) return null;
    const ranked = rankRowsByMetric(ds.parsedRows, disc, "desc").slice(0, 5);
    if (!ranked.length) return null;
    return {
      id: "discount-usage",
      title: "Discount / void watchlist",
      subtitle: `Highest ${disc.name} — review whether discounts are intentional and effective.`,
      tone: "warning",
      table: {
        headers: rev ? ["Item", disc.name, rev.name] : ["Item", disc.name],
        rows: ranked.map(({ i, v }) => {
          const row = [
            rowDimension(ds.parsedRows[i], primaryDims) || "Row " + (i + 1),
            fmtNumber(v, disc.type),
          ];
          if (rev) row.push(fmtNumber(rowMetric(ds.parsedRows[i], rev), rev.type));
          return row;
        }),
      },
    };
  }

  function ruleStaffPeak(ds, roles, primaryDims) {
    // Only fires if there's a time dimension column
    const timeCol =
      (roles.weekday && roles.weekday[0]) ||
      (roles.hour && roles.hour[0]) ||
      (roles.date && roles.date[0]) ||
      ds.columns.find((c) => c.isTime);
    if (!timeCol) return null;
    const rev = (roles.revenue && roles.revenue[0]) || (roles.quantity && roles.quantity[0]);
    if (!rev) return null;

    // Group rows by the time column (Sales by Weekday, etc.)
    const groups = new Map();
    for (const r of ds.parsedRows) {
      const key = (r[timeCol.index] && r[timeCol.index].raw) || "";
      if (!key) continue;
      const v = rowMetric(r, rev);
      if (typeof v !== "number") continue;
      groups.set(key, (groups.get(key) || 0) + v);
    }
    if (groups.size === 0) return null;

    const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, Math.min(3, sorted.length));
    const bottom = sorted.slice(-Math.min(3, sorted.length)).reverse();

    return [
      {
        id: "staff-up",
        title: `Staff up · Busiest ${timeCol.name.toLowerCase()}s`,
        subtitle: `Highest ${rev.name}. Schedule extra hands and prep ahead.`,
        tone: "positive",
        table: {
          headers: [timeCol.name, rev.name],
          rows: top.map(([k, v]) => [k, fmtNumber(v, rev.type)]),
        },
      },
      {
        id: "staff-down",
        title: `Cut hours · Slowest ${timeCol.name.toLowerCase()}s`,
        subtitle: `Lowest ${rev.name}. Trim labor or run focused promos to lift traffic.`,
        tone: "warning",
        table: {
          headers: [timeCol.name, rev.name],
          rows: bottom.map(([k, v]) => [k, fmtNumber(v, rev.type)]),
        },
      },
    ];
  }

  function ruleCategoryBreakdown(ds, roles, primaryDims) {
    const itemCol = roles.item && roles.item[0];
    if (!itemCol) return null;
    const metric = (roles.revenue && roles.revenue[0]) || (roles.quantity && roles.quantity[0]);
    if (!metric) return null;

    const groups = new Map();
    for (const r of ds.parsedRows) {
      const key = (r[itemCol.index] && r[itemCol.index].raw) || "";
      if (!key) continue;
      const v = rowMetric(r, metric);
      if (typeof v !== "number") continue;
      groups.set(key, (groups.get(key) || 0) + v);
    }
    if (groups.size <= 1) return null;
    const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    return {
      id: "category-breakdown",
      title: `${itemCol.name} breakdown`,
      subtitle: `Where ${metric.name} actually came from — focus marketing on the categories that matter.`,
      tone: "info",
      table: {
        headers: [itemCol.name, metric.name, "Share"],
        rows: sorted.map(([k, v]) => [
          k,
          fmtNumber(v, metric.type),
          total > 0 ? ((v / total) * 100).toFixed(1) + "%" : "—",
        ]),
      },
    };
  }

  function ruleSummary(ds, roles) {
    const items = [];
    items.push({ label: "Rows captured", value: ds.rowCount.toLocaleString() });
    items.push({ label: "Columns", value: ds.columnCount.toLocaleString() });
    const rev = roles.revenue && roles.revenue[0];
    const qty = roles.quantity && roles.quantity[0];
    if (rev && rev.sum != null) items.push({ label: rev.name, value: fmtNumber(rev.sum, rev.type) });
    if (qty && qty.sum != null) items.push({ label: qty.name, value: fmtNumber(qty.sum, qty.type) });
    if (rev && qty && qty.sum > 0) {
      items.push({
        label: "Implied avg ticket",
        value: fmtNumber(rev.sum / qty.sum, rev.type),
        detail: `${rev.name} / ${qty.name}`,
      });
    }
    return {
      id: "summary",
      title: "Snapshot",
      subtitle: "Quick totals for this report.",
      tone: "neutral",
      items,
    };
  }

  // ---------- analyzer entrypoint -------------------------------------------

  // ---------- weekday-pivoted (wide) analysis -------------------------------

  const WEEKDAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  function isTotalLabel(s) {
    if (Dataset && Dataset.isTotalLabel) return Dataset.isTotalLabel(s);
    return s && /^(total|all|all\s*day|grand\s*total|subtotal|sum)$/i.test(String(s).trim());
  }

  function widePerRowSummary(ds) {
    const weekdayCols = ds.columns.filter((c) => c.isWeekday);
    const rollupCol = ds.columns.find((c) =>
      /^(week\s*to\s*date|wtd|weekday\s*total|week\s*total|total)$/i.test(c.name.trim()) && c.isMetric
    );
    const dimCol = ds.columns.find((c) => c.isDimension) || ds.columns[0];

    const summaries = [];
    for (let i = 0; i < ds.parsedRows.length; i++) {
      const row = ds.parsedRows[i];
      const label = (row[dimCol.index] && row[dimCol.index].raw) || "";
      const isTotal = isTotalLabel(label);
      const weekdayValues = weekdayCols.map((c) => {
        const cell = row[c.index];
        const v = cell && (cell.type === "number" || cell.type === "currency") ? cell.value : null;
        return { col: c, value: typeof v === "number" ? v : null };
      });
      const numeric = weekdayValues.filter((w) => typeof w.value === "number");
      const sumWeek = numeric.reduce((s, w) => s + w.value, 0);
      const rollupCell = rollupCol ? row[rollupCol.index] : null;
      const rollup = rollupCell && (rollupCell.type === "number" || rollupCell.type === "currency")
        ? rollupCell.value
        : null;
      const total = typeof rollup === "number" ? rollup : sumWeek;
      let peak = null;
      for (const w of numeric) {
        if (peak == null || (w.value != null && w.value > peak.value)) peak = w;
      }
      const nonZero = numeric.filter((w) => w.value > 0).length;
      summaries.push({
        i,
        label,
        isTotal,
        weekdayValues,
        total,
        peakWeekday: peak,
        nonZeroCount: nonZero,
        activeDayCount: nonZero,
      });
    }
    return { summaries, weekdayCols, rollupCol, dimCol };
  }

  function widePickMetricType(ds) {
    const weekdayCols = ds.columns.filter((c) => c.isWeekday);
    if (weekdayCols.some((c) => c.type === "currency")) return "currency";
    if (weekdayCols.some((c) => c.type === "percent")) return "percent";

    // Heuristic: when the dataset's source / title / parameters mention a
    // money concept and the numeric values look money-shaped (have cents),
    // promote to currency.  This handles Oracle .xlsx exports where cells
    // come through as plain "1,588.23" without a $ sign.
    let nonZero = 0;
    let withDecimals = 0;
    for (const r of ds.parsedRows) {
      for (const c of weekdayCols) {
        const cell = r[c.index];
        if (!cell || (cell.type !== "number" && cell.type !== "currency")) continue;
        if (typeof cell.value !== "number" || cell.value === 0) continue;
        nonZero += 1;
        if (Math.round(cell.value * 100) !== Math.round(cell.value) * 100) withDecimals += 1;
      }
    }
    const moneyContext = /sales|revenue|net|gross|amount|\$/i.test(
      [ds.title || "", ds.source || "", (ds.parameters || []).map((p) => `${p.key} ${p.value}`).join(" ")].join(" ")
    );
    if (moneyContext && nonZero > 0 && withDecimals / nonZero >= 0.3) return "currency";
    if (nonZero > 0 && withDecimals / nonZero >= 0.6) return "currency";
    return "number";
  }

  function ruleWideTopMovers(ds, summ, metricType) {
    const candidates = summ.summaries
      .filter((s) => !s.isTotal && typeof s.total === "number" && s.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    if (!candidates.length) return null;
    return {
      id: "top-movers",
      title: "Sell & make more of these · Top weekly performers",
      subtitle: "Highest total weekly sales. Lean into them in displays, promotions, and prep volume.",
      tone: "positive",
      table: {
        headers: ["Item", "Week total", "Peak day"],
        rows: candidates.map((s) => [
          s.label,
          fmtNumber(s.total, metricType),
          s.peakWeekday ? `${s.peakWeekday.col.name} (${fmtNumber(s.peakWeekday.value, metricType)})` : "—",
        ]),
      },
    };
  }

  function ruleWideSlowMovers(ds, summ, metricType) {
    const candidates = summ.summaries
      .filter((s) => !s.isTotal && typeof s.total === "number" && s.total > 0)
      .sort((a, b) => a.total - b.total)
      .slice(0, 10);
    if (!candidates.length) return null;
    return {
      id: "slow-movers",
      title: "Make less of these · Slowest weekly performers",
      subtitle: "Lowest non-zero weekly sales. Cut prep volume to reduce waste — or remove from the menu.",
      tone: "negative",
      table: {
        headers: ["Item", "Week total", "Days active"],
        rows: candidates.map((s) => [
          s.label,
          fmtNumber(s.total, metricType),
          `${s.activeDayCount}/${summ.weekdayCols.length}`,
        ]),
      },
    };
  }

  function ruleWideZeroMovers(ds, summ, metricType) {
    const candidates = summ.summaries
      .filter((s) => !s.isTotal && typeof s.total === "number" && s.total === 0);
    if (!candidates.length) return null;
    const top = candidates.slice(0, 15);
    return {
      id: "zero-movers",
      title: `Remove or rethink · ${candidates.length} item${candidates.length === 1 ? "" : "s"} sold $0 all week`,
      subtitle: "Zero sales every day this week. Pull from the menu, swap with a tester, or run a clearance.",
      tone: "warning",
      table: {
        headers: ["Item"],
        rows: top.map((s) => [s.label]),
      },
    };
  }

  function ruleWidePutOnSale(ds, summ, metricType) {
    const active = summ.summaries.filter((s) => !s.isTotal && typeof s.total === "number" && s.total > 0);
    if (active.length < 6) return null;
    const sorted = active.slice().sort((a, b) => a.total - b.total);
    const q1Idx = Math.floor((sorted.length - 1) * 0.25);
    const q1Threshold = sorted[q1Idx].total;
    const candidates = sorted
      .filter((s) => s.total <= q1Threshold && s.activeDayCount >= 1)
      .slice(0, 10);
    if (!candidates.length) return null;
    return {
      id: "put-on-sale",
      title: "Put these on sale / discount",
      subtitle: "Bottom-quartile movers — discount, bundle, or feature to clear product before waste.",
      tone: "warning",
      table: {
        headers: ["Item", "Week total", "Days active"],
        rows: candidates.map((s) => [
          s.label,
          fmtNumber(s.total, metricType),
          `${s.activeDayCount}/${summ.weekdayCols.length}`,
        ]),
      },
    };
  }

  function ruleWidePromote(ds, summ, metricType) {
    // High peak-day spike but low average across the rest of the week
    const active = summ.summaries.filter(
      (s) => !s.isTotal && typeof s.total === "number" && s.total > 0 && s.peakWeekday
    );
    if (active.length < 4) return null;
    const candidates = active
      .map((s) => {
        const peak = s.peakWeekday.value;
        const others = s.weekdayValues.filter((w) => w !== s.peakWeekday && typeof w.value === "number");
        const otherSum = others.reduce((a, w) => a + (w.value || 0), 0);
        const otherDays = others.length || 1;
        const otherMean = otherSum / otherDays;
        const concentration = peak / Math.max(s.total, 1e-9);
        return { s, peak, otherMean, concentration };
      })
      .filter((x) => x.concentration >= 0.6 && x.s.total > 0)
      .sort((a, b) => b.concentration - a.concentration)
      .slice(0, 8);
    if (!candidates.length) return null;
    return {
      id: "promote",
      title: "Promote these · One-day wonders",
      subtitle: "Sales are heavily concentrated on a single day — try featuring or upselling on the rest.",
      tone: "info",
      table: {
        headers: ["Item", "Peak day", "Peak share of week"],
        rows: candidates.map(({ s, concentration }) => [
          s.label,
          s.peakWeekday ? `${s.peakWeekday.col.name} (${fmtNumber(s.peakWeekday.value, metricType)})` : "—",
          (concentration * 100).toFixed(1) + "%",
        ]),
      },
    };
  }

  function ruleWideStaffing(ds, summ, metricType) {
    const totalRow = summ.summaries.find((s) => s.isTotal && /^total$/i.test(s.label.trim()))
      || summ.summaries.find((s) => s.isTotal);
    let perDay;
    if (totalRow) {
      perDay = totalRow.weekdayValues
        .filter((w) => typeof w.value === "number")
        .map((w) => ({ name: w.col.name, value: w.value }));
    } else {
      const groups = new Map();
      for (const s of summ.summaries) {
        if (s.isTotal) continue;
        for (const w of s.weekdayValues) {
          if (typeof w.value !== "number") continue;
          groups.set(w.col.name, (groups.get(w.col.name) || 0) + w.value);
        }
      }
      perDay = Array.from(groups.entries()).map(([name, value]) => ({ name, value }));
    }
    if (!perDay.length) return null;
    const sorted = perDay.slice().sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, Math.min(3, sorted.length));
    const bottom = sorted.slice(-Math.min(3, sorted.length)).reverse();
    return [
      {
        id: "staff-up",
        title: "Staff up · Busiest weekdays",
        subtitle: "Highest total sales. Schedule extra hands and prep ahead.",
        tone: "positive",
        table: {
          headers: ["Weekday", "Total sales"],
          rows: top.map((d) => [d.name, fmtNumber(d.value, metricType)]),
        },
      },
      {
        id: "staff-down",
        title: "Cut hours · Slowest weekdays",
        subtitle: "Lowest total sales. Trim labor or run focused promos to lift traffic.",
        tone: "warning",
        table: {
          headers: ["Weekday", "Total sales"],
          rows: bottom.map((d) => [d.name, fmtNumber(d.value, metricType)]),
        },
      },
    ];
  }

  function ruleWideMakeMoreOnDay(ds, summ, metricType) {
    const cards = [];
    const active = summ.summaries.filter((s) => !s.isTotal && typeof s.total === "number");
    for (const wcol of summ.weekdayCols) {
      const dayRanked = active
        .map((s) => {
          const cell = ds.parsedRows[s.i][wcol.index];
          const v = cell && (cell.type === "number" || cell.type === "currency") ? cell.value : null;
          return { s, v };
        })
        .filter((x) => typeof x.v === "number" && x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 5);
      if (dayRanked.length === 0) continue;
      cards.push({
        id: `make-more-${wcol.name.toLowerCase()}`,
        title: `Make more on ${wcol.name} · Top ${dayRanked.length} sellers`,
        subtitle: `These items pulled the most ${wcol.name} sales last week. Prep more stock and feature them on this day.`,
        tone: "info",
        table: {
          headers: ["Item", `${wcol.name} sales`],
          rows: dayRanked.map(({ s, v }) => [s.label, fmtNumber(v, metricType)]),
        },
      });
    }
    return cards;
  }

  function ruleWideSummary(ds, summ, metricType) {
    const totalRow = summ.summaries.find((s) => s.isTotal && /^total$/i.test(s.label.trim()));
    const items = [];
    items.push({ label: "Items captured", value: (summ.summaries.length - summ.summaries.filter((s) => s.isTotal).length).toLocaleString() });
    items.push({ label: "Days analyzed", value: summ.weekdayCols.map((c) => c.name).join(" · ") });
    if (totalRow) {
      items.push({ label: "Week total", value: fmtNumber(totalRow.total, metricType) });
      if (totalRow.peakWeekday) {
        items.push({
          label: "Best day",
          value: `${totalRow.peakWeekday.col.name} (${fmtNumber(totalRow.peakWeekday.value, metricType)})`,
        });
      }
      const numericVals = totalRow.weekdayValues.filter((w) => typeof w.value === "number");
      if (numericVals.length) {
        const sortedAsc = numericVals.slice().sort((a, b) => a.value - b.value);
        const slow = sortedAsc[0];
        items.push({
          label: "Slowest day",
          value: `${slow.col.name} (${fmtNumber(slow.value, metricType)})`,
        });
      }
    } else {
      let weekTotal = 0;
      for (const s of summ.summaries) {
        if (s.isTotal) continue;
        if (typeof s.total === "number") weekTotal += s.total;
      }
      if (weekTotal > 0) items.push({ label: "Week total (computed)", value: fmtNumber(weekTotal, metricType) });
    }
    items.push({
      label: "Items with $0 all week",
      value: summ.summaries.filter((s) => !s.isTotal && s.total === 0).length.toLocaleString(),
    });
    return {
      id: "summary",
      title: "Snapshot",
      subtitle: "Quick totals for this report.",
      tone: "neutral",
      items,
    };
  }

  function analyzeWideWeekday(ds) {
    const summ = widePerRowSummary(ds);
    if (!summ.weekdayCols.length || !summ.summaries.length) return null;
    const metricType = widePickMetricType(ds);

    const insights = [];
    insights.push(ruleWideSummary(ds, summ, metricType));

    const staffing = ruleWideStaffing(ds, summ, metricType);
    if (staffing) insights.push(...staffing);

    const candidates = [
      ruleWideTopMovers(ds, summ, metricType),
      ruleWideSlowMovers(ds, summ, metricType),
      ruleWidePutOnSale(ds, summ, metricType),
      ruleWidePromote(ds, summ, metricType),
      ruleWideZeroMovers(ds, summ, metricType),
    ];
    for (const c of candidates) if (c) insights.push(c);

    const dayCards = ruleWideMakeMoreOnDay(ds, summ, metricType);
    if (dayCards && dayCards.length) insights.push(...dayCards);

    return {
      datasetId: ds.id,
      title: ds.title,
      kind: ds.kind,
      rowCount: ds.rowCount,
      columnCount: ds.columnCount,
      insights,
    };
  }

  // ---------- analyzer entrypoint -------------------------------------------

  function analyzeDataset(ds) {
    if (ds.kind === "wide-weekday") {
      const out = analyzeWideWeekday(ds);
      if (out) return out;
    }

    const roles = classifyColumns(ds.columns);
    const primaryDims = pickPrimaryDimension(ds.columns, ds.parsedRows);

    const insights = [];
    const summary = ruleSummary(ds, roles);
    if (summary && (summary.items || []).length) insights.push(summary);

    const candidates = [
      ruleTopMovers(ds, roles, primaryDims),
      ruleSlowMovers(ds, roles, primaryDims),
      ruleBuyMore(ds, roles, primaryDims),
      rulePromote(ds, roles, primaryDims),
      rulePutOnSale(ds, roles, primaryDims),
      ruleMarginAlerts(ds, roles, primaryDims),
      ruleDiscountUsage(ds, roles, primaryDims),
      ruleStaffPeak(ds, roles, primaryDims),
      ruleCategoryBreakdown(ds, roles, primaryDims),
    ];
    for (const c of candidates) {
      if (!c) continue;
      if (Array.isArray(c)) insights.push(...c);
      else insights.push(c);
    }
    return {
      datasetId: ds.id,
      title: ds.title,
      kind: ds.kind,
      rowCount: ds.rowCount,
      columnCount: ds.columnCount,
      roles: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, v.map((c) => c.name)])),
      insights,
    };
  }

  function analyzeAll(datasets) {
    return (datasets || []).map(analyzeDataset);
  }

  const api = { analyzeDataset, analyzeAll, classifyColumns, fmtNumber };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KilwinsAnalyzer = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
