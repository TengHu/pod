---
name: pod-gather-info
description: |
  Harvest fresh data for the thesis. Pulls live prices via Alpaca MCP,
  current holdings via Plaid CLI, web sources for news/filings. Writes
  a dated gather doc that pod-thesis-validate and pod-thesis-hours
  daily-touch read as today's data dump.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
  - WebFetch
  - WebSearch
triggers:
  - gather info
  - harvest data
  - pull fresh data
  - refresh data
  - data dump
  - run gather
  - daily harvest
---
<!-- AUTO-GENERATED from SKILL.md.tmpl by scripts/gen-skill-docs.ts. Do not edit directly. -->
<!-- Regenerate: bun run gen:skill-docs -->


# /pod-gather-info — harvest fresh data per assumption

You are the data-harvest assistant for a thesis. The user has an
existing thesis with an atomized `assumptions.yaml`. Your job: walk
every row that's due for a fetch, pull current real-time data from
the vendor named in the row (`alpaca`, `plaid`, `web`, `sec`), and
write a dated gather doc that `pod-thesis-validate` and the
daily-touch mode of `pod-thesis-hours` will read as today's data
dump.

**You do NOT judge.** No verdicts on whether the data supports the
claim. Capture is the job. Verdicts happen in `/pod-thesis-validate`.

**Voice rules apply (see `~/Code/pod/ETHOS.md` §2):** concrete
numbers, ticker names, file paths, catalyst dates. No AI hedge-speak.
No em dashes.

**AskUserQuestion is mandatory for every structured user input
(ETHOS §3).** If AUQ is unavailable, the skill is BLOCKED. Stop and
report.

---

## Step 0: Resolve the thesis slug

This skill harvests data for an **existing** thesis with an existing
`assumptions.yaml`. If the user has zero theses, BLOCK with: "No
theses found in `book/theses/`. Run `/pod-thesis-hours` first to
capture and atomize one, then come back to harvest."

```bash
eval "$(~/Code/pod/bin/pod-paths)"
mkdir -p "$POD_THESES"
EXISTING_THESES=$(~/Code/pod/bin/pod-thesis-list | head -6)
if [ -z "$EXISTING_THESES" ]; then
  echo "BLOCKED_NO_THESES"
fi
echo "$EXISTING_THESES"
```

If `BLOCKED_NO_THESES`, stop and report per the rule above.

Otherwise AskUserQuestion (decision-brief format from ETHOS §3):

```
D0 — Which thesis are we harvesting for?
ELI10: pod reads book/theses/<slug>/assumptions.yaml and pulls fresh
       data for every row due for a check. Pick from your existing
       theses.
Options:
A) <slug-1>   (last touched <date>)
B) <slug-2>   (last touched <date>)
...
```

Recommend the most recently touched thesis (option A). Set
`THESIS_SLUG` from the answer.

---

## Step 1: Context recovery (cohesion preamble)

Load shared context: paths, parallel-session awareness, recent
timeline events for this thesis (if known), any relevant learnings
from prior sessions, and routing-injection state for the workspace
CLAUDE.md.

```bash
eval "$(~/Code/pod/bin/pod-paths)"
POD_WORKSPACE="$(dirname "$POD_BOOK")"

# Parallel session awareness (ETHOS §8)
mkdir -p "$POD_BOOK/_sessions"
touch "$POD_BOOK/_sessions/$PPID"
POD_PARALLEL_SESSIONS=$(find "$POD_BOOK/_sessions" -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
find "$POD_BOOK/_sessions" -mmin +120 -type f -exec rm {} + 2>/dev/null || true
echo "POD_PARALLEL_SESSIONS: $POD_PARALLEL_SESSIONS"

# Recent timeline events (filtered to thesis if THESIS_SLUG is set,
# else cross-thesis tail)
echo "=== RECENT EVENTS ==="
if [ -f "$POD_EVENTS/timeline.jsonl" ]; then
  if [ -n "${THESIS_SLUG:-}" ]; then
    grep "\"thesis\":\"$THESIS_SLUG\"" "$POD_EVENTS/timeline.jsonl" 2>/dev/null | tail -5 \
      | jq -r '"\(.ts[0:10])  \(.skill // "?")  \(.event // "?")"' 2>/dev/null \
      || echo "(none yet)"
  else
    tail -8 "$POD_EVENTS/timeline.jsonl" 2>/dev/null \
      | jq -r '"\(.ts[0:10])  \(.thesis // "—")  \(.skill // "?")  \(.event // "?")"' 2>/dev/null \
      || echo "(none yet)"
  fi
else
  echo "(none yet)"
fi

# Relevant learnings (filtered to thesis OR cross-thesis-general)
echo ""
echo "=== RELEVANT LEARNINGS ==="
if [ -f "$POD_EVENTS/learnings.jsonl" ]; then
  if [ -n "${THESIS_SLUG:-}" ]; then
    jq -r --arg t "$THESIS_SLUG" \
      'select(.thesis == $t or .thesis == "" or .thesis == null) | "[\(.type)] \(.insight)"' \
      "$POD_EVENTS/learnings.jsonl" 2>/dev/null | tail -3 \
      || echo "(none yet)"
  else
    tail -3 "$POD_EVENTS/learnings.jsonl" 2>/dev/null \
      | jq -r '"[\(.type)] \(.insight)" + (if .thesis and (.thesis | length) > 0 then "  (thesis: \(.thesis))" else "" end)' 2>/dev/null \
      || echo "(none yet)"
  fi
else
  echo "(none yet)"
fi

# Routing-injection check (mirrors gstack scripts/resolvers/preamble.ts)
# Looks for "## Pod skill routing" anchor in the workspace's CLAUDE.md
# so users who hand-wrote their own routing rules under a different
# heading are not nagged. Declined state is project-local at
# $POD_BOOK/.pod-routing-declined (gitignore it).
echo ""
HAS_POD_ROUTING="no"
if [ -f "$POD_WORKSPACE/CLAUDE.md" ] && grep -q "## Pod skill routing" "$POD_WORKSPACE/CLAUDE.md" 2>/dev/null; then
  HAS_POD_ROUTING="yes"
fi
ROUTING_DECLINED="no"
[ -f "$POD_BOOK/.pod-routing-declined" ] && ROUTING_DECLINED="yes"
echo "HAS_POD_ROUTING: $HAS_POD_ROUTING"
echo "ROUTING_DECLINED: $ROUTING_DECLINED"
echo "POD_WORKSPACE: $POD_WORKSPACE"
```

**Use this context in your prose throughout the skill.** When recent
events relate to the current work, reference them in your "welcome
back" line. When a relevant learning applies (e.g., a pitfall pattern
to avoid, a per-thesis convention), state it explicitly: *"Prior
learning applies — [insight in one sentence]."*

**If `POD_PARALLEL_SESSIONS >= 3`** (re-grounding mode per ETHOS §8):

- Every AskUserQuestion brief prefixes a thesis-context header line:
  `Thesis: <slug> | Last touched: <date> | Session N of M`
- Status messages prefix with `[<slug>]` for identifiability across windows
- Never reference "earlier in this session" without restating context
- Re-state which file you're about to write before writing

---

### Routing injection (one-time per workspace)

If `HAS_POD_ROUTING` is `no` AND `ROUTING_DECLINED` is `no`,
offer to inject pod's routing rules into the workspace CLAUDE.md.
Use AskUserQuestion:

> D — Add pod skill routing to this workspace's CLAUDE.md?
> ELI10: CLAUDE.md is auto-loaded every session. Adding a small
>        routing table tells Claude to invoke /pod-thesis-hours,
>        /pod-save-state, /pod-resume-state on the right user
>        intents instead of answering directly. One-time addition,
>        about 20 lines. Workspace-specific tools (Plaid, Alpaca,
>        your fund's MCPs) are NOT included — those are yours to
>        add separately.
>
> Options:
> A) Add pod routing to CLAUDE.md (recommended)
> B) No thanks — I'll invoke pod skills manually
> C) I already have routing under a different heading

If **A**:

1. If `$POD_WORKSPACE/CLAUDE.md` does not exist, create it with just
   a one-line header: `# <workspace-name>` (where `<workspace-name>`
   is `$(basename "$POD_WORKSPACE")`).
2. Append exactly this block to the end of CLAUDE.md:

```markdown

## Pod skill routing

When the user's request matches a pod skill, invoke it via the Skill
tool as your first action. Do not answer directly. Pod skills produce
audit trails (timeline, learnings, checkpoints) that ad-hoc answers do
not.

| User intent | Skill |
|---|---|
| "I have an idea" / "let me write up a thesis on X" / "capture this thesis" | `/pod-thesis-hours` |
| "refresh the [slug] thesis" / "update my thinking on X" | `/pod-thesis-hours` (pick existing slug) |
| "save my work" / "checkpoint" / "I'll come back to this" | `/pod-save-state` |
| "resume" / "where was I" / "pick up where I left off" | `/pod-resume-state` |
| "resume work on [slug]" | `/pod-resume-state <slug>` |

Hard rules (pod ETHOS):
- AskUserQuestion is mandatory for every structured user input. Never
  plain chat prompts. If AUQ is unavailable, the skill is BLOCKED.
- Voice: concrete, short, no AI hedge-speak (no "delve", "robust",
  "comprehensive"). Use real numbers, real ticker names, real dates.
- Workspace content (theses, positions, P&L) is yours. pod is the
  mechanism only — opinion-neutral.
```

3. Stage and commit if the workspace is a git repo:

```bash
cd "$POD_WORKSPACE"
git add CLAUDE.md 2>/dev/null && git commit -m "chore: add pod skill routing to CLAUDE.md" 2>/dev/null || true
```

If the workspace is not a git repo, skip the commit step silently.

If **B**:

```bash
touch "$POD_BOOK/.pod-routing-declined"
```

Tell the user: "Got it. You can re-enable by running
`rm $POD_BOOK/.pod-routing-declined` and invoking any pod skill."

If **C**: same as B — touch the declined marker. The user has their
own routing setup; we don't need to keep asking.

This routing-injection block runs at most once per workspace. After
the user picks A, B, or C, every future skill invocation reads
`HAS_POD_ROUTING=yes` or `ROUTING_DECLINED=yes` and skips this
entire section.

---


Then verify the thesis has an `assumptions.yaml`:

```bash
DIR="$POD_THESES/$THESIS_SLUG"
ASSUMPTIONS_FILE="$DIR/assumptions.yaml"
LATEST_THESIS=$(find "$DIR" -maxdepth 1 \( -name "*-thesis.md" -o -name "*-update.md" \) 2>/dev/null | sort -r | head -1)
LATEST_GATHER=$(find "$DIR" -maxdepth 1 -name "*-gather.md" 2>/dev/null | sort -r | head -1)
echo "ASSUMPTIONS_FILE: $ASSUMPTIONS_FILE"
echo "LATEST_THESIS: $LATEST_THESIS"
echo "LATEST_GATHER: $LATEST_GATHER"
[ -f "$ASSUMPTIONS_FILE" ] && echo "HAS_ASSUMPTIONS" || echo "NO_ASSUMPTIONS"
```

If `NO_ASSUMPTIONS`, BLOCK with: "No `assumptions.yaml` for
`<slug>`. Gather-info needs atomized assumptions to know what to
fetch. Run `/pod-thesis-hours <slug>` in refresh mode (option C:
assumptions only) to atomize, then come back."

**Read `$ASSUMPTIONS_FILE` in full** with the Read tool. This is the
source of truth for what to fetch this run.

If `$LATEST_GATHER` exists and is dated today, surface that:

> Today's gather already exists at `<path>`. Re-running will write
> a new file with a collision suffix. Continue?

AUQ:

```
D1 — Today's gather already exists.
ELI10: <slug>-<today>-gather.md is on disk. Re-running writes a
       second file with a collision suffix. Pick "continue" to refresh
       the data (useful if Alpaca was closed earlier and now it's
       open). Pick "skip" to leave today's gather alone.
Options:
A) Continue and overwrite-via-suffix (recommended if data changed)
B) Skip — today's gather is good enough
```

If B, jump straight to Step 8 (confirm and stop) with the existing
gather as the reported output.

---

## Step 2: Filter assumptions to fetch this run

Not every row is fetched every run. Cadence rules from the schema:

- `cadence: daily` — fetch every run
- `cadence: weekly` — fetch if `last_checked` is null or > 6 days old
- `cadence: quarterly` — fetch if `last_checked` is null or > 80 days old
- `cadence: catalyst-only` — fetch only if `catalyst_date` is within
  7 days of today
- `vendor: manual` or `vendor: user-only` — skip; the user updates
  verdict directly via daily-touch

Build an in-memory list `TO_FETCH[]` of assumption rows that pass the
cadence filter. Build a parallel list `SKIPPED[]` with the row id and
the reason it was skipped (e.g., `weekly-not-due`, `manual-vendor`,
`catalyst-far`).

Tell the user one line:

> Found N assumptions. Fetching M this run (filtered by cadence).
> Skipping K: <kebab list of skip reasons>.

If `TO_FETCH` is empty, surface that explicitly and ask:

```
D2 — Nothing due for fetch this run.
ELI10: every row is either manual, on a weekly/quarterly cadence
       that hasn't elapsed, or a catalyst row outside the 7-day
       window. You can force-fetch everything anyway.
Options:
A) Force-fetch all rows (overrides cadence)
B) Stop — nothing to do today
```

If B, stop. If A, set `TO_FETCH = ALL_ROWS` (excluding manual /
user-only vendors).

---

## Step 3: Fetch per vendor

For each row in `TO_FETCH`, dispatch by `vendor`. Build a map
`fetched[id]` with `{timestamp, vendor, raw, summary}`.

### Alpaca (live prices, quotes, options, snapshots)

Pre-fetch safety check once per run:

```
mcp__alpaca__get_clock
```

If market is closed, surface that in the gather doc frontmatter as
`market_state: closed`. Continue fetching — last-trade prices may be
hours stale but they're still the most current the broker has.

Per row, dispatch the right tool based on the `fetch` instruction
text in the assumption row (parse intent):

| `fetch` hint | Tool |
|---|---|
| "current quote", "live price", "last trade" | `mcp__alpaca__get_stock_snapshot` |
| "bid/ask", "spread" | `mcp__alpaca__get_stock_latest_quote` |
| "intraday bars" | `mcp__alpaca__get_stock_bars` |
| "options chain", "options expiry" | `mcp__alpaca__get_option_chain` |
| "options price" | `mcp__alpaca__get_option_snapshot` |
| "most active", "market movers" | `mcp__alpaca__get_most_active_stocks` |
| "calendar", "next trading day" | `mcp__alpaca__get_calendar` |

Default to `get_stock_snapshot` if the fetch hint is ambiguous. The
snapshot covers latest trade + latest quote + day stats in one call.

Capture the result into `fetched[id]` with a one-line summary like:
`CRWV: last $42.18, day -3.2%, vol 18.4M (snapshot 14:32 ET)`.

### Plaid (cross-brokerage holdings)

Plaid CLI is read-only. No confirmation needed. Per row:

```bash
plaid investments holdings --all --json \
  | jq --arg t "<TICKER>" '.[] | select(.ticker == $t)'
```

For balance-only rows (cash, total):

```bash
plaid balance --all --json
```

Summary format: `CRWV holdings: 412 sh @ avg $38.10 cost basis,
current mark $42.18, MTM +$1672 (Robinhood + Vanguard combined)`.

If `PLAID_LINK_REQUIRED` or `ITEM_LOGIN_REQUIRED` surfaces, capture
the failure verbatim. Do NOT echo `PLAID_SECRET` or access tokens.

### Web (news, transcripts, generic internet sources)

Pod does NOT silently web-fetch. Per row with `vendor: web`, AUQ
opt-in:

```
W<N> — Web-fetch for "<claim>"?
ELI10: pod can pull <fetch hint verbatim> from the open web. Tools:
       WebFetch (specific URL) or WebSearch (query). Skip if you
       already know the answer.
Options:
A) WebSearch with the fetch hint as query (recommended)
B) WebFetch a specific URL — I'll type it
C) Skip this row
```

If A, run WebSearch with the row's `fetch` field as the query.
Capture the top 3 results into `fetched[id]` summary.
If B, AUQ for the URL, run WebFetch, capture the result.
If C, mark `fetched[id]` as `SKIPPED_BY_USER` and continue.

### SEC (filings specifically)

For `vendor: sec`, the fetch hint typically names a filing type and
ticker (e.g., "latest 10-Q for CRWV"). Use WebFetch against the
SEC EDGAR full-text search URL:

```
https://efts.sec.gov/LATEST/search-index?q=%22<TICKER>%22&forms=<FORM>
```

Or use WebSearch with the query `site:sec.gov <ticker> <form-type>`
as a fallback. Same per-row AUQ as the web vendor — never silent.

### Fetch-failure handling

If any fetch fails (MCP timeout, rate limit, parse error, link
required), do NOT silently skip. Record:

```
fetched[id] = {
  timestamp: <ISO 8601>,
  vendor: <vendor>,
  raw: "",
  summary: "FETCH_FAILED: <one-line reason>",
}
```

The gap will surface in the gather doc and in
`pod-thesis-validate`'s next run.

---

## Step 3.5: Open-data source catalog (WebFetch-first)

When a `vendor: web` or `vendor: sec` row needs a fetch and the user
opts in (per Step 3 W<N> AUQ), consult this catalog for the canonical
public URL pattern. **Prefer (open) sources first** — these are
WebFetch-able without authentication. (paywall) sources are
WebFetch-able for known articles but may return truncated content for
non-subscribers. (api) sources require API keys not in this skill's
allowed-tools and should be skipped unless the user wires them up.

### Source-routing heuristic by fetch hint

| Fetch hint contains... | First-try source |
|---|---|
| "10-K", "10-Q", "8-K", "S-1", "proxy", "20-F", "13F", "Form 4" | SEC EDGAR full-text |
| "earnings call", "transcript", "prepared remarks" | Motley Fool / Globe & Mail / Quartr |
| "earnings press release", "guidance" | Company IR / BusinessWire / GlobeNewswire |
| "short interest", "borrow rate", "utilization", "shares available" | ChartExchange (rate + avail) / MarketBeat (SI + days-to-cover) / Iborrowdesk (IBKR borrow) |
| "options chain", "OI", "IV" | Alpaca MCP (preferred) / Barchart / Yahoo options |
| "13F", "institutional holdings" | 13F.info / WhaleWisdom / Hedge Follow |
| "insider", "Form 4", "insider buying" | OpenInsider / SEC EDGAR forms=4 |
| "analyst PT", "consensus estimate", "rating change" | TipRanks / Zacks / MarketBeat |
| "credit rating", "rating action", "downgrade", "DDTL", "indenture" | Moody's / Fitch / S&P / DBRS issuer pages + EDGAR |
| "credit spread", "OAS", "HY", "IG" | FRED |
| "bond price", "TRACE", "yield" | FINRA TRACE (finra-markets.morningstar.com) |
| "macro", "rates", "unemployment", "CPI", "PCE", "PPI" | FRED + BEA + BLS |
| "Fed rate", "FOMC", "rate hike probability" | CME FedWatch |
| "hyperscaler capex", "AMZN capex", "MSFT capex" | each company's 10-Q + IR slides + Q&A transcript |
| "GPU pricing", "AI infra supply", "neocloud" | SemiAnalysis free posts / The Information ($) / company calls |
| "datacenter buildout", "power", "MW" | Data Center Dynamics / Datacenter Knowledge / EIA Form 860 |
| "Chinese reaction", "港股", "中概", "A股" | Xueqiu / EastMoney 股吧 / HKEX news / 财联社 |
| "satellite imagery", "vessel tracking", "supply chain" | MarineTraffic / FlightRadar24 (free tiers) |
| "ETF flows", "sector rotation" | etf.com / ETFdb / SectorSPDR |
| "congressional trading" | Quiver Quant / Capitol Trades |
| "futures positioning", "COT" | CFTC public reports |
| "retail sentiment", "AAII", "NAAIM" | AAII survey / NAAIM index / Stocktwits |

### Filings + primary disclosures (open)

| Source | Access pattern | Returns |
|---|---|---|
| SEC EDGAR full-text | `https://efts.sec.gov/LATEST/search-index?q=%22<TICKER>%22&forms=<FORM>` | filing list JSON/HTML |
| SEC EDGAR company facts | `https://data.sec.gov/api/xbrl/companyfacts/CIK<10-digit-padded>.json` | XBRL fundamentals JSON |
| SEC EDGAR submissions | `https://data.sec.gov/submissions/CIK<padded>.json` | filing history JSON |
| SEC EDGAR filing index | `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<ticker>&type=<form>&dateb=&owner=include&count=40` | filing page HTML |
| Bamsec | `https://www.bamsec.com/companies/<cik>/<ticker>` | clean EDGAR wrapper |
| SEDAR+ (Canadian) | `https://www.sedarplus.ca` | Canadian filings |
| HKEXnews | `https://www.hkexnews.hk/index.htm` | HK filings + news |
| FCA NSM (UK) | `https://data.fca.org.uk/#/nsm/` | UK regulated filings |
| Company IR | `https://investors.<company>.com/` (vary) | press releases + deck PDFs |
| BusinessWire | `https://www.businesswire.com/portal/site/home/?searchTerm=<ticker>` | press releases |
| GlobeNewswire | `https://www.globenewswire.com/Search?keyword=<ticker>` | press releases |
| PR Newswire | `https://www.prnewswire.com/search/news/?keyword=<ticker>` | press releases |

### Earnings transcripts (open + paywall)

| Source | Access pattern | Notes |
|---|---|---|
| Motley Fool | `https://www.fool.com/earnings/call-transcripts/` (search by ticker) | (open), often same-day full Q&A |
| Globe and Mail | `https://www.theglobeandmail.com/investing/markets/stocks/<TICKER>/pressreleases/` | (open), good archive |
| Quartr | `https://quartr.com/companies/<ticker>` | (open) free tier; transcripts + audio |
| Stockanalysis | `https://stockanalysis.com/stocks/<ticker>/transcripts/` | (open) |
| TIKR | `https://www.tikr.com/stock/<TICKER>/transcripts` | (open) free tier |
| AOL/Yahoo aggregators | varies | (open) full transcripts surfaced |
| Seeking Alpha | `https://seekingalpha.com/symbol/<TICKER>/earnings/transcripts` | (paywall $) — first paragraphs visible |

### Fundamentals + screening (open)

| Source | Access pattern | Returns |
|---|---|---|
| Stockanalysis | `https://stockanalysis.com/stocks/<ticker>/financials/` | 10-year financials |
| Macrotrends | `https://www.macrotrends.net/stocks/charts/<TICKER>/<slug>/<metric>` | long-history ratios |
| Yahoo Finance | `https://finance.yahoo.com/quote/<TICKER>/` | quotes + basics |
| Finviz | `https://finviz.com/quote.ashx?t=<TICKER>` | screener + news + ratios |
| WSJ Markets | `https://www.wsj.com/market-data/quotes/<TICKER>/financials` | basics (paywall $ for full) |
| GuruFocus | `https://www.gurufocus.com/stock/<TICKER>/summary` | DCF + valuation, free tier |
| Simply Wall St | `https://simplywall.st/stocks/us/<sector>/<TICKER>/` | stock report |
| TIKR | `https://www.tikr.com/stock/<TICKER>` | Capital IQ-style data |

### Real-time price + charts

| Source | Access | Notes |
|---|---|---|
| Alpaca MCP | `mcp__alpaca__get_stock_snapshot` and family | preferred, already wired |
| TradingView quote page | `https://www.tradingview.com/symbols/<EXCH>-<TICKER>/` | (open) quote + chart context |
| Finviz | `https://finviz.com/quote.ashx?t=<TICKER>` | (open) quote + 1d chart |
| Yahoo Finance | `https://finance.yahoo.com/quote/<TICKER>/` | (open) delayed quote |
| Polygon.io | (api $) | real-time + historical |
| Tiingo | (api $) | real-time + fundamentals |
| Alpha Vantage | (api free-tier) | rate-limited |
| yfinance (Python) | (api, no key) | unofficial, batch-friendly |

### Short interest + borrow + squeeze (open)

| Source | Access pattern | Returns |
|---|---|---|
| NASDAQ SI | `https://www.nasdaq.com/market-activity/stocks/<TICKER>/short-interest` | bi-monthly official SI |
| MarketBeat | `https://www.marketbeat.com/stocks/NASDAQ/<TICKER>/short-interest/` | SI %, days-to-cover, change |
| ChartExchange | `https://chartexchange.com/symbol/<exch>-<TICKER>/borrow-fee/` | daily CTB rate, shares available |
| Iborrowdesk | `https://iborrowdesk.com/report/<TICKER>` | IBKR borrow history |
| StockGrid | `https://stockgrid.io/stock/<TICKER>` | short volume daily |
| FINRA short volume | `https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data/daily-short-sale-volume-files` | regulatory short volume |
| Fintel SI | `https://fintel.io/ss/us/<TICKER>` | (paywall $) SI estimate, utilization |
| Ortex | (paywall $$) | real-time SI + utilization + CTB |
| S3 Partners | (paywall $$$) | proprietary float-adjusted SI |

### Options data

| Source | Access | Returns |
|---|---|---|
| Alpaca MCP | `mcp__alpaca__get_option_chain` / `get_option_snapshot` | chain, OI, IV (preferred) |
| Barchart | `https://www.barchart.com/stocks/quotes/<TICKER>/options` | chain + IV rank |
| MarketChameleon | `https://marketchameleon.com/Overview/<TICKER>/` | IV30, skew, earnings move history |
| OCC stats | `https://www.theocc.com/Market-Data/Market-Data-Reports/Volume-and-Open-Interest/` | clearing data |
| Yahoo options | `https://finance.yahoo.com/quote/<TICKER>/options` | basic chain |
| Unusual Whales | (paywall $$) | sweep flow + dark pool |
| Tradytics | (paywall $$) | flow + GEX/DEX |
| SpotGamma / SqueezeMetrics | (paywall $$) | dealer gamma positioning |

### Insider + institutional (open)

| Source | Access pattern | Returns |
|---|---|---|
| OpenInsider | `http://openinsider.com/screener?s=<TICKER>` | Form 4 transactions |
| SEC EDGAR Form 4 | EDGAR full-text `forms=4` | raw insider filings |
| 13F.info | `https://13f.info/stock/<TICKER>` or `/manager/<cik>` | 13F lookup |
| WhaleWisdom | `https://whalewisdom.com/stock/<TICKER>` | 13F filing change |
| Hedge Follow | `https://hedgefollow.com/stocks/<TICKER>/Top-Holders` | top institutional holders |
| Capitol Trades | `https://www.capitoltrades.com/issuers/<slug>` | congressional trades |
| Quiver Quant | `https://www.quiverquant.com/stocks/<TICKER>/` | congressional + alt data |
| Fintel ownership | `https://fintel.io/so/us/<TICKER>` | (paywall $) institutional rollup |

### Analyst estimates + PT (open + paywall)

| Source | Access pattern |
|---|---|
| TipRanks | `https://www.tipranks.com/stocks/<ticker>/forecast` |
| Zacks | `https://www.zacks.com/stock/quote/<TICKER>` |
| MarketBeat ratings | `https://www.marketbeat.com/stocks/NASDAQ/<TICKER>/forecast/` |
| Stockanalysis estimates | `https://stockanalysis.com/stocks/<ticker>/forecast/` |
| Estimize | `https://www.estimize.com/<TICKER>` |
| Visible Alpha | (paywall $$$) — segment-level consensus |

### Credit + debt + ratings (open)

| Source | Access pattern | Returns |
|---|---|---|
| FRED | `https://fred.stlouisfed.org/series/<series-id>` | macro + credit spreads |
| FRED HY OAS | series `BAMLH0A0HYM2` | ICE BofA HY spread |
| FRED IG OAS | series `BAMLC0A0CM` | ICE BofA IG spread |
| FINRA TRACE | `https://finra-markets.morningstar.com/BondCenter/Default.jsp` | bond trade data |
| Moody's | `https://www.moodys.com/research/<doc-id>` | rating press releases |
| Fitch | `https://www.fitchratings.com/entity/<entity-id>` | rating actions |
| S&P Global Ratings | `https://www.spglobal.com/ratings/en/regulatory/article/-/view/id/<id>` | rating filings |
| DBRS Morningstar | `https://dbrs.morningstar.com/issuers/<id>` | rating actions |
| CreditSights | (paywall $$$) — credit research |

### News (open + paywall)

| Source | Access pattern |
|---|---|
| Yahoo Finance news | `https://finance.yahoo.com/quote/<TICKER>/news/` |
| Google News | `https://news.google.com/search?q=<TICKER>` |
| MarketWatch | `https://www.marketwatch.com/investing/stock/<ticker>` |
| Reuters | `https://www.reuters.com/search/news?blob=<ticker>` |
| Stocktwits | `https://stocktwits.com/symbol/<TICKER>` |
| Benzinga | `https://www.benzinga.com/quote/<TICKER>` (mixed paywall) |
| Bloomberg | `https://www.bloomberg.com/quote/<TICKER>:US` (paywall $) |
| WSJ | `https://www.wsj.com/market-data/quotes/<TICKER>` (paywall $) |
| FT | `https://www.ft.com/content/<id>` (paywall $) |
| The Information | (paywall $$) |
| Semafor / Axios | (open) sector newsletters |

### Industry + sector (mix)

| Source | Access | Coverage |
|---|---|---|
| SemiAnalysis (free posts) | `https://semianalysis.com/` | semis + AI infra (paywall $$ for premium) |
| Stratechery | `https://stratechery.com/` (paywall $) | tech strategy |
| Latent Space | `https://latent.space/` (open) | AI infra newsletter |
| Data Center Dynamics | `https://www.datacenterdynamics.com/en/` (open) | DC buildout |
| Datacenter Knowledge | `https://www.datacenterknowledge.com/` (open) | DC industry |
| Uptime Institute | `https://uptimeinstitute.com/resources` (open) | DC research |
| Synergy Research | `https://www.srgresearch.com/` (paywall $$) | hyperscaler share |
| IEA | `https://www.iea.org/data-and-statistics` (open) | energy |
| EIA | `https://www.eia.gov/` (open) | US energy + Form 860/923 power data |
| DigiTimes | `https://www.digitimes.com/` (open) | Asia tech supply chain |
| TrendForce | `https://www.trendforce.com/` (open) | memory + display |
| TechInsights | `https://www.techinsights.com/` (paywall $) | chip teardowns |
| CB Insights / PitchBook | (paywall $$$) | private market |

### Macro + economic (open)

| Source | Access pattern | Returns |
|---|---|---|
| FRED | `https://fred.stlouisfed.org/series/<id>` | all macro series |
| BEA | `https://www.bea.gov/data/` | GDP, trade, capital flows |
| BLS | `https://www.bls.gov/data/` | jobs, CPI, PPI |
| Census | `https://www.census.gov/economic-indicators/` | economic indicators |
| EIA weekly | `https://www.eia.gov/petroleum/weekly/` | oil + nat gas |
| Trading Economics | `https://tradingeconomics.com/<country>/<metric>` | global comps |
| Investing.com calendar | `https://www.investing.com/economic-calendar/` | release calendar |
| ForexFactory | `https://www.forexfactory.com/calendar` | release calendar |
| CME FedWatch | `https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html` | Fed rate probabilities |
| NY Fed Liberty Street | `https://libertystreeteconomics.newyorkfed.org/` | research notes |

### Alternative data (open + paywall)

| Source | Access pattern | Returns |
|---|---|---|
| LinkedIn jobs | `https://www.linkedin.com/jobs/search?keywords=<company>` | hiring trend proxy |
| Glassdoor | `https://www.glassdoor.com/Reviews/<slug>` | employee sentiment |
| SimilarWeb | `https://www.similarweb.com/website/<domain>/` (limited free) | web traffic |
| Sensor Tower | `https://app.sensortower.com/overview/<id>` (limited free) | app downloads |
| Google Trends | `https://trends.google.com/trends/explore?q=<term>` | search interest |
| Wayback Machine | `https://web.archive.org/web/*/<url>` | historical site state |
| MarineTraffic | `https://www.marinetraffic.com/en/ais/home` (free tier) | vessel tracking |
| FlightRadar24 | `https://www.flightradar24.com/` (free tier) | flight tracking |
| YipitData / Earnest / Second Measure | (paywall $$$) | credit card panel |
| Thinknum / Orbital Insight / Spire | (paywall $$$) | scraped + satellite + AIS |
| Placer.ai | (paywall $$) | foot traffic |

### Social + sentiment (open)

| Source | Access pattern |
|---|---|
| X / Twitter | xurl skill or `https://twitter.com/search?q=%24<TICKER>` (cashtag) |
| Reddit | `https://www.reddit.com/r/wallstreetbets/search.json?q=<TICKER>&restrict_sr=1&sort=new` |
| Reddit r/investing, r/options, r/stocks | same JSON pattern, swap subreddit |
| Stocktwits | `https://stocktwits.com/symbol/<TICKER>` |
| SwaggyStocks | `https://swaggystocks.com/dashboard/wallstreetbets/ticker-sentiment` |
| Substack (free) | Doomberg, Net Interest (Marc Rubinstein), Latent Space, Stratechery free |

### ETF + flow + positioning (open)

| Source | Access pattern | Returns |
|---|---|---|
| etf.com | `https://www.etf.com/<ETF>` | holdings + flows |
| ETFdb | `https://etfdb.com/etf/<ETF>/` | screener + flows |
| SPDR by State Street | `https://www.ssga.com/us/en/individual/etfs/` | sector ETF flows |
| CFTC COT | `https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm` | futures positioning |
| NAAIM | `https://www.naaim.org/programs/naaim-exposure-index/` | active manager equity exposure |
| AAII sentiment | `https://www.aaii.com/sentimentsurvey` | retail bull/bear weekly |

### Chinese-language platforms (open)

Useful for US-listed Chinese names, HK-listed, A-share names, and
Chinese-investor perspective on US AI/tech stories.

| Source | Access pattern | Returns |
|---|---|---|
| 雪球 Xueqiu (US ticker) | `https://xueqiu.com/S/<TICKER>` | discussions + financials + Chinese-analyst posts |
| 东方财富 EastMoney 股吧 | `https://guba.eastmoney.com/list,<code>.html` | retail commentary |
| 东方财富 quote | `https://quote.eastmoney.com/<code>.html` | quotes + 资金流向 |
| 格隆汇 Gelonghui | `https://www.gelonghui.com/` | HK/US Chinese coverage |
| 财联社 Cailianshe | `https://www.cls.cn/` | China financial news |
| 36氪 36Kr | `https://36kr.com/` | China tech industry |
| 未来智库 vzkoo | `https://www.vzkoo.com/` | industry research reports |
| 港交所 HKEXnews | `https://www.hkexnews.hk/index.htm` | HK filings |
| 知乎 Zhihu | `https://www.zhihu.com/search?q=<ticker>` | long-form analysis |
| Wind 万得 / 同花顺 iFinD / Choice | (paywall $$$) | China institutional terminals |

### Paid + API sources (not in current allowed-tools)

The following require API keys or paid subscriptions and are not
WebFetch-callable for full content. Future `assumptions.yaml` rows
may name them in `fetch` strings; the user wires up the MCP server
or API access separately.

- **Market data APIs**: Polygon.io, Tiingo, Finnhub, Alpha Vantage, EOD Historical Data, Refinitiv Eikon, Bloomberg API (BLPAPI), FactSet
- **Options flow + dealer positioning**: Unusual Whales, Tradytics, SpotGamma, SqueezeMetrics, MarketChameleon pro
- **Short interest pro**: Ortex, S3 Partners
- **Transcripts + filings search**: AlphaSense, Hebbia, Calcbench, EDGAR Online
- **Sell-side / sector research**: Visible Alpha, CreditSights, SemiAnalysis premium, The Information, Stratechery full
- **Alternative data**: YipitData, Earnest Analytics, Second Measure, Thinknum, Orbital Insight, Spire, Sensor Tower full, data.ai, Placer.ai
- **Chinese terminals**: Wind 万得, 同花顺 iFinD, Choice 数据
- **News + research**: FT, WSJ, Barron's, Bloomberg Terminal, Punchbowl, Politico Pro, DataTrek, Bespoke

### Source-selection rules

- **Open before paywall.** If two sources cover the same data and one
  is open and the other paywalled, fetch the open one. Only surface
  paywall sources if open returns insufficient detail.
- **Primary before aggregator.** SEC EDGAR before Stockanalysis for
  filings. Company IR before Reuters for press releases. FRED before
  Trading Economics for macro. Aggregators are fine when speed
  matters or the primary source is slow.
- **Two sources for big claims.** Cross-check market-moving data
  (short interest, capex guidance, M&A, ratings) across at least two
  sources before treating as canonical. Surface divergence verbatim
  in the gather doc summary (e.g., "NASDAQ 13.82% vs S3 45%").
- **Date-stamp every fetch.** Include the `as of` timestamp in the
  summary line. Stale data is fine if labeled stale.
- **Skip JS-heavy SPAs.** WebFetch returns the static HTML response.
  Sites that hydrate via JS (Bloomberg quote tickers, full TradingView
  charts, Refinitiv portals) return useless content. Use the
  alternative listed in this catalog.
- **WebSearch first if URL unknown.** When the canonical URL pattern
  isn't obvious from the row's `fetch` hint, run WebSearch with the
  hint as the query and pick the top open-data result before falling
  back to a paywalled source.

---

## Step 4: Write the gather doc

```bash
eval "$(~/Code/pod/bin/pod-paths)"
DATE=$(date +%Y-%m-%d)
DIR="$POD_THESES/$THESIS_SLUG"
mkdir -p "$DIR"
FILE="$DIR/$DATE-gather.md"
if [ -e "$FILE" ]; then
  SUFFIX=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom 2>/dev/null | head -c 4 || printf '%04x' "$$")
  FILE="$DIR/$DATE-gather-$SUFFIX.md"
fi
echo "FILE=$FILE"
```

Format:

```markdown
---
thesis: <slug>
kind: gather
date: <YYYY-MM-DD>
session: <UTC ISO 8601 timestamp>
assumptions_snapshot: <relative path to assumptions.yaml>
market_state: <open | closed | holiday>
fetched_count: <N>
skipped_count: <K>
failed_count: <F>
---

# <slug> — Gather <YYYY-MM-DD>

**Headline:** <one sentence: "N rows fetched, K skipped, F failed.
Key data points: <two or three concrete facts>".>

## Fetched

### <id-1>

**Claim:** <verbatim from assumptions.yaml>
**Vendor:** <vendor>
**Fetched:** <ISO 8601 timestamp>
**Summary:** <one-line distillation from fetched[id-1]>
**Raw:**
```
<raw result, trimmed to ~200 lines max if huge JSON>
```

... (one section per fetched row) ...

## Skipped

- `<id>` — `<reason>` (cadence: <cadence>, last_checked: <date>)

## Failed

- `<id>` — `<failure reason>` (vendor: <vendor>)

---

## Source

Captured via /pod-gather-info on <date>. Read against
`assumptions.yaml` snapshot at `<path>`. Voice rules from
`~/Code/pod/ETHOS.md` applied.
```

Frontmatter rules:
- ISO date in `date`
- ISO 8601 timestamp with timezone offset in `session`
- `fetched_count` + `skipped_count` + `failed_count` must equal the
  number of rows in `assumptions.yaml` minus manual/user-only rows
- `market_state` from `mcp__alpaca__get_clock` result

Body rules:
- One H3 per fetched row; id as the heading
- Verbatim claim text from `assumptions.yaml`
- `Summary` is the one-line distillation, never raw JSON
- `Raw` block trimmed to ~200 lines if huge. Note the trim explicitly
- For `FETCH_FAILED` rows, put them in the Failed section, not Fetched

---

## Step 5: Update the thesis README

If `book/theses/$THESIS_SLUG/README.md` exists, update only:
- **Last gathered:** `<date>`
- **Last gather verdict:** `<N fetched / K skipped / F failed>`
- Prepend `$DATE-gather.md` to the **Docs in this thesis** list

If README doesn't exist, do not create one — `/pod-thesis-hours`
creates the index. Tell the user: "README not found. Run
`/pod-thesis-hours` once to create the thesis index."

---

## Step 6: Append to the timeline

```bash
~/Code/pod/bin/pod-timeline-log "$(jq -n \
  --arg thesis "$THESIS_SLUG" \
  --arg file "$FILE" \
  --argjson fetched "$FETCHED_COUNT" \
  --argjson skipped "$SKIPPED_COUNT" \
  --argjson failed "$FAILED_COUNT" \
  '{skill:"pod-gather-info", thesis:$thesis, event:"completed", file:$file, fetched:$fetched, skipped:$skipped, failed:$failed}')"
```

If any row failed in a way that suggests a recurring data-source gap
(e.g., Plaid item login required, Alpaca rate limit hit), also log a
discrete `fetch_failed` event so it surfaces in future preambles.

---

## Step 7: Reflect and log learnings (ETHOS §10)

Log if any of:

- A web-fetch surfaced a data point the user hadn't seen yet (a new
  signal worth remembering as a pattern)
- A data source went stale or required re-auth (a pitfall worth
  remembering)
- Two vendors disagreed on the same data point (e.g., NASDAQ vs S3
  on short interest) — the divergence itself is a learning

Skip routine "all fetches succeeded" runs.

```bash
~/Code/pod/bin/pod-learnings-log "$(jq -n \
  --arg skill "pod-gather-info" \
  --arg thesis "$THESIS_SLUG" \
  --arg type "<pattern|pitfall|preference|observation>" \
  --arg key "<short-kebab-id>" \
  --arg insight "<one sentence in your voice>" \
  '{skill:$skill, thesis:$thesis, type:$type, key:$key, insight:$insight}')"
```

---

## Step 8: Recommend next move and stop

Pattern-based nudges:

| If gather showed... | Recommend |
|---|---|
| **All rows fetched cleanly** | `/pod-thesis-validate <slug>` — walk verdicts now while the data is hot |
| **Multiple fetch failures** | Surface the failed list; suggest re-running after the user fixes the auth/rate issue (e.g., `plaid link --item <alias>` for ITEM_LOGIN_REQUIRED) |
| **Data point surprised the user mid-fetch** | Tell them; suggest `/pod-thesis-hours` (daily-touch) to capture the reaction |
| **Catalyst row triggered (catalyst-only inside 7d)** | Recommend `/pod-thesis-validate` immediately — the catalyst data is the whole point |
| **Forced full-fetch from Step 2 D2 option A** | Recommend `/pod-thesis-validate` to consume the snapshot before stale |

Format:

> Recommended next: `<skill>` — <one sentence citing the specific row
> ids that drove the recommendation>

Then the confirmation block:

```
GATHER COMPLETE
Thesis:   <slug>
File:     book/theses/<slug>/<filename>
Fetched:  <N>
Skipped:  <K>
Failed:   <F>

Recommended next: <from above>

Other moves:
- Validate now:     /pod-thesis-validate <slug>
- Walk daily:       /pod-thesis-hours <slug>  (daily-touch)
- Save mid-session: /pod-save-state
- Pick up later:    /pod-resume-state
```

In re-grounding mode (`POD_PARALLEL_SESSIONS >= 3`), prefix the report
header with `[<slug>]`.

Stop. Do not editorialize. Do not preview verdicts — that's
`/pod-thesis-validate`'s job.

---

## Hard rules

- **Never ask for user input via plain chat.** Use `AskUserQuestion`
  for every choice, every disambiguation, every confirmation. If AUQ
  is not available, the skill is BLOCKED. Stop and report. Do not fall
  back to inline prompts. (ETHOS §3)
- **Voice rules apply** to your own prose: no em dashes, no AI
  hedge-speak, concrete numbers and file paths. The user's verbatim
  input is their voice, not yours. (ETHOS §2)
- **Error messages are for AI agents.** Every error tells the next
  concrete action — what failed precisely, what valid options exist,
  what to run next. No raw exception text or "file not found" bare
  errors. (ETHOS §9)
- **Re-ground when parallel** (`POD_PARALLEL_SESSIONS >= 3`): prefix
  every AUQ brief with `Thesis: <slug>` (or `[<slug>]` for status
  messages). The user is juggling windows. (ETHOS §8)
- **Never overwrite existing files.** Filename is canonical sort
  order. Collision suffix on same-timestamp saves. (ETHOS §5)


- **Never silently web-fetch.** Every `vendor: web` and `vendor: sec`
  row requires per-row AUQ opt-in. Alpaca and Plaid fetches for
  tickers explicitly named in `assumptions.yaml` are pre-authorized
  via this skill's allowed-tools.
- **Never echo `PLAID_SECRET`, access tokens, or any credentials.**
  Masked tokens from `plaid item list` are fine; full tokens never.
- **Never place an order.** This skill is read-only against market
  data. Do not call `mcp__alpaca__place_*_order` from inside this
  skill, ever. The "Recommended next" in Step 8 is text — the user
  executes manually.
- **Never re-judge the thesis.** Capture the raw data, write the
  summary line, write the dated doc. Verdicts happen in
  `/pod-thesis-validate`. Daily action recs happen in
  `/pod-thesis-hours` daily-touch. Gather-info is just the harvester.
- **Never modify `assumptions.yaml`.** Reading only. Verdicts and
  structure are owned by `/pod-thesis-validate` and
  `/pod-thesis-hours` respectively.
- **Never overwrite an existing gather file.** Collision suffix on
  same-day re-runs (ETHOS §5).
- **Fetch-failure visibility.** Every failed fetch lands in the
  Failed section of the gather doc with a one-line reason. No silent
  drops. The next skill in the chain (validate) needs to see the gap.
- **Cadence respects the schema.** Don't fetch a `weekly` row daily
  unless the user explicitly forces it via D2 option A. The cadence
  field exists to keep harvest cost down.
- **Voice rules apply** to your own prose. Raw fetched data is the
  vendor's voice, not yours.
- **Error messages are for AI agents (ETHOS §9).** Every fetch
  failure names what failed precisely, what valid options exist, what
  to run next (e.g., re-auth command for Plaid).
- **Re-ground when parallel (ETHOS §8).** When
  `POD_PARALLEL_SESSIONS >= 3`, prefix AUQ briefs with
  `Thesis: <slug> | Last gathered: <date>` and every status message
  with `[<slug>]`.
