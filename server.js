const express = require("express");
const yahooFinance = require("yahoo-finance2").default;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function toPct(value) {
  return Number((value * 100).toFixed(2));
}

function calcReturn(startPrice, endPrice) {
  if (!startPrice || !endPrice) return null;
  return (endPrice / startPrice) - 1;
}

function filterByYear(rows, year) {
  return rows.filter((r) => {
    const d = new Date(r.date);
    return d.getUTCFullYear() === year && r.close != null;
  });
}

app.get("/api/performance", async (req, res) => {
  try {
    const rawTicker = (req.query.ticker || "").toString().trim();

    if (!rawTicker) {
      return res.status(400).json({ error: "Ticker is verplicht." });
    }

    const ticker = rawTicker.toUpperCase();
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const firstFullYear = currentYear - 5; // vb: 2021 als currentYear 2026 is

    const period1 = new Date(Date.UTC(firstFullYear, 0, 1));
    const period2 = now;

    const history = await yahooFinance.historical(ticker, {
      period1,
      period2,
      interval: "1d"
    });

    if (!history || history.length === 0) {
      return res.status(404).json({ error: `Geen koersdata gevonden voor ${ticker}.` });
    }

    const rows = history
      .filter((r) => r.close != null && r.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (rows.length < 2) {
      return res.status(404).json({ error: `Onvoldoende data voor ${ticker}.` });
    }

    const yearly = [];

    for (let y = firstFullYear; y < currentYear; y += 1) {
      const yrRows = filterByYear(rows, y);
      if (yrRows.length < 2) {
        yearly.push({ year: y, returnPct: null });
        continue;
      }
      const start = yrRows[0].close;
      const end = yrRows[yrRows.length - 1].close;
      const ret = calcReturn(start, end);
      yearly.push({ year: y, returnPct: ret == null ? null : toPct(ret) });
    }

    const validYearly = yearly.filter((y) => y.returnPct != null).map((y) => y.returnPct);
    const avg5y = validYearly.length
      ? Number((validYearly.reduce((a, b) => a + b, 0) / validYearly.length).toFixed(2))
      : null;

    const ytdRows = filterByYear(rows, currentYear);
    const ytd = ytdRows.length >= 2
      ? toPct(calcReturn(ytdRows[0].close, ytdRows[ytdRows.length - 1].close))
      : null;

    const latest = rows[rows.length - 1];

    return res.json({
      ticker,
      currency: latest.currency || null,
      asOf: latest.date,
      years: yearly,
      average5yPct: avg5y,
      ytdPct: ytd
    });
  } catch (err) {
    const msg = err?.message || "Onbekende fout";
    return res.status(500).json({ error: `Fout bij ophalen data: ${msg}` });
  }
});

app.listen(PORT, () => {
  console.log(`Screener draait op http://localhost:${PORT}`);
});
