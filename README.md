# Bills Planner

A phone-first planner for a separate Bills account. It works out how much to move from each
paycheck so bills are always covered, what's left to spend each pay period, and how budgets,
debt payoff and savings are tracking.

**Open it:** https://bill6006.github.io/bills-planner2/ (on a phone, add it to your home screen)

## Your data

Everything is saved in the browser on your device (localStorage). Nothing is uploaded.
Use **Settings → Export backup / Import backup** to move data between devices or keep a copy.

Coming from Bills Planner 4: in v4 use **Export JSON**, then **Settings → Import backup** here.
Opened the same way as v4 (same browser and location), v5 copies v4's data in automatically
and leaves v4's copy untouched.

## Status

A rebuild of Bills Planner 4, in progress.

- Done: planning engine (matches v4 exactly), Overview, Ledger, Log spending, Settings.
- Next: Spending, Plan (income, bills, budgets, debts), Savings.

## Development

- Source lives in `src/`: `engine.js` (planning math), `store.js` (saved data and migration),
  `ui.js` (screens), `styles.css`, `shell.html`.
- `python build.py` writes the whole app to one self-contained file, `dist/index.html`.
  Open it directly; no server or internet connection needed.
- Every push to `main` builds and deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Math check against v4

`tests/parity.html` runs Bills Planner 4 (`tests/old.html`, unchanged) and the new engine side
by side on five datasets, and compares every number v4 shows: month plans with each day's
balances, the ten month stats, the ledger, pay periods, spending, graphs, history, debt and
savings.

```bash
python build.py
python -m http.server 8793
```

Open http://localhost:8793/tests/parity.html and run `await runParity()` in the browser
console. Every row should report `diffCount: 0`.
