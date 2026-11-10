# Running App Install Ads

How to build, launch, watch and prune an app install campaign on Facebook and
Instagram with this repo, the Meta ads MCP server and the Meta Ads CLI. Finish
`app-install-setup.md` first.

## The loop

| Step | What happens | Tool |
|---|---|---|
| 1. Plan | Pick 3 hooks to test and a daily budget | `examples/site-visit-app-brief.md` as a model |
| 2. Make | Render the ads and package them | `creative:render`, `creative:package` |
| 3. Build | Create the campaign in Meta, paused | `creative:upload` or the MCP server |
| 4. Approve | A human reviews and switches it on | Ads Manager |
| 5. Watch | Daily health check, no edits | MCP server or `meta ads insights` |
| 6. Score | Rank hooks and layouts after 7 days | `creative:score` |
| 7. Act | Pause losers, keep the winner, test again | MCP server, CLI or Ads Manager |

## 1. Plan the test

- Test **one variable at a time**. Start with hooks: the opening line that names
  the customer's problem. Keep the button, headline and offer the same.
- Use **one ad set per hook**, each with the same 2 or 3 layouts.
- Use **ad set budgets**, not a campaign budget, so each hook gets equal spend.
- Give each ad set enough to learn. Meta wants about 50 installs per ad set per
  week. Divide your daily budget by a guessed cost per install to see how many
  ad sets you can afford. On a small budget that is usually 3.
- Run for **7 full days** so every weekday is covered.

Put this in a render job with a `matrix` (see the README's "Creative tests").

## 2. Make the ads

```sh
npm run creative:render -- --job my-job.json --out-dir output/round-1
npm run creative:package -- --config campaigns.json --out-dir dist
```

The package step lays the images out as campaign / ad set / ad folders. The
upload script reads that layout.

## 3. Build the campaign, paused

### With the upload script (Meta Ads CLI)

Copy `examples/meta-upload.config.example.json`, fill in your Page ID, Meta app
ID and App Store URL, then:

```sh
npm run creative:upload -- --config my-upload.json             # print the commands only
npm run creative:upload -- --config my-upload.json --validate  # ask Meta to check the campaign, create nothing
npm run creative:upload -- --config my-upload.json --run       # create everything, paused
```

It creates one campaign (objective `OUTCOME_APP_PROMOTION`), one ad set per
hook (optimising for `APP_INSTALLS`, targeted to your countries and iOS) and one
ad per creative. Created IDs are saved next to the config in a `.state.json`
file, so a run that stops halfway can be started again without duplicates. The
script never reads your token; the CLI does.

Run it from the folder that holds the CLI's `.env`.

Known gaps, because Meta's CLI docs have no app install example:

- The docs don't list `INSTALL_MOBILE_APP` as a button value. If the creative
  step is refused, set `callToAction` to `DOWNLOAD`.
- The targeting and promoted-object JSON follow the Marketing API.
- It uploads one image size per ad. Add the 9:16 and 1:1 images in Ads Manager.
- Carousels are skipped. Build those by hand.

### With the MCP server

Ask the agent to build the same structure with `ads_create_campaign`,
`ads_create_ad_set`, `ads_create_creative` and `ads_create_ad`. Have it call
`ads_get_field_context` first to learn the accepted fields, because Meta's docs
don't publish the tool parameters. Whether the creative tool can upload a local
image file is not confirmed; if it can't, use the upload script for creatives.

### By hand

Follow the notes the package step writes into each folder, and name each ad
after its folder. The scorer matches on ad names.

## 4. Approve and launch

Before anything is switched on, a human checks in Ads Manager:

- each ad's destination is the App Store and the button reads Install,
- budget, dates, countries and placements on every ad set,
- every ad set has an end date,
- installs are showing in Events Manager.

Then activate the campaign. An agent may do this with `ads_activate_entity` only
when the human says so in that conversation.

## 5. Watch it

Leave the test alone for 7 days. Editing, pausing or adding ads restarts Meta's
learning and spoils the comparison. Replying to comments is fine.

Check once a day, read-only:

- With the MCP server, ask for spend, impressions, link clicks and installs per
  ad for the campaign (`ads_get_ad_entities`), and for anything unusual
  (`ads_insights_anomaly_signal`).
- With the CLI:

  ```sh
  meta ads insights get --campaign-id CAMPAIGN_ID --fields spend,impressions,ctr,cpc
  ```

Step in early only for these:

| Signal | Action |
|---|---|
| An ad is rejected | Fix or replace it |
| An ad set spends nothing after 48 hours | Check the audience size and budget |
| Spend is well above the daily budget | Pause and investigate |
| No installs anywhere after 2 days, but clicks are normal | Tracking is broken. Recheck setup step 6 |
| Hostile or off-brand comments pile up | Pause that ad |

Install counts on iOS can be delayed and are modelled, so judge on 7 days, not
on yesterday.

## 6. Find the winners and losers

In Ads Manager, export at **ad level** with Ad name, Amount spent, Impressions,
Link clicks and App installs for the test's dates. Then:

```sh
npm run creative:score -- --manifest output/round-1/manifest.json --results export.csv
```

The report ranks hooks, layouts and CTAs, pools each one across its ads and
marks thin data. When there are fewer than 30 installs in
total it falls back to link clicks, which show interest, not installs. Confirm
any click-based winner against installs in App Store Connect.

How to read it:

- **Winner:** clearly ahead on installs for the same spend.
- **Loser:** clearly behind, or spent its share with few installs.
- **Unclear:** a small test only finds large gaps. "No clear difference" doesn't
  mean equal. Carry the leader forward and retest.
- Layout results are weaker than hook results, because Meta favours some ads
  inside an ad set. Trust the pooled layout figure.

Cross-check totals: installs reported by Meta against first-time downloads in
App Store Connect for the same days. Meta will be lower on iOS. A large or
growing gap points at tracking, not creative.

## 7. Act on it

1. Keep the winning ad set running untouched.
2. Pause the losing ad sets with `ads_update_entity` or in Ads Manager. Pause,
   don't delete: the history is the record of the test.
3. Start round 2: the winner against two new hooks, same budget per ad set.
4. After two or three rounds, move the budget to a small always-on campaign
   built from the winners, and refresh creative when frequency climbs and
   click-through falls.
5. Raise budgets in steps of about 20% every few days. Large jumps restart
   learning.

Every pause, activation and budget change needs a human yes. See the safety
rules in the README.

## What to tell the human each week

- What ran, and what it spent.
- Installs and cost per install, with the App Store Connect figure beside it.
- The winner, the losers, and how sure the data is.
- What to pause, what to keep, and what to test next.

`report-template.md` has the full shape.
