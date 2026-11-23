# Reporting

## Performance Read

Start with the business question:

- Did the creative earn attention?
- Did it attract the right traffic?
- Did it convert?
- Did it teach us something useful?

## Metrics

Use the metrics that match the objective:

- awareness: reach, frequency, CPM, thumb-stop signals,
- traffic: CTR, CPC, landing page views,
- leads/signups: conversion rate, CPA, cost per qualified lead,
- purchases/top-ups: ROAS, CPA, conversion value,
- creative fatigue: frequency, CTR decline, CPM rise.

## Read The Funnel In Order

Diagnose from the top down, and change only the part that is failing:

| Metric | Formula | If it's low |
|---|---|---|
| Hook rate | 3-second video plays ÷ impressions | Change the first 3 seconds only |
| Hold rate | ThruPlays ÷ 3-second plays | Tighten the middle; show the product sooner |
| CTR (link) | link clicks ÷ impressions | The offer or CTA is weak |
| Cost per result / ROAS | spend ÷ results; revenue ÷ spend | Check the offer and landing page before the ad |

Common starting bars are a hook rate of 25–30%, a hold rate of 10–15% and a
link CTR around 1%. These are media-buyer rules of thumb, not Meta benchmarks,
and vary by category, placement and price. After about four weeks, replace them
with the account's own averages and compare against those.

## Fixed Reads After Launch

Read on a schedule, not whenever someone looks:

- **Day 1: delivery only.** Is every ad spending? Any rejections? Where is the
  money going: break spend down by placement, and flag any placement taking
  most of the budget with a click-through rate far above 1% (usually Audience
  Network). No verdicts on ads; early numbers swing.
- **Day 3: cut clear losers.** Propose cutting ads that spent about 2x the
  target cost per result with no result, or whose hook rate is far below the
  ad set's average. Everything else keeps running.
- **Day 7: scale clear winners.** Propose scaling ads under target cost with at
  least 2x target cost in spend: move them to the scaling campaign or raise the
  budget about 20% every 2 to 3 days, and brief 3 new hooks on the same body
  before the winner fatigues.
- **Weekly report.** What won, what lost, why, and next round's angles. Group
  by the parts encoded in ad names (angle, format, hook type) so the account
  learns which kinds of ad win, not just which ad.

Every cut, scale or budget change is a proposal marked `NEEDS APPROVAL`. Don't
judge with less than 3 days of data. For matrix tests, `npm run creative:score`
does the pooled comparison.

## Testing Short Against Long Copy

- Put the long versions in their own ad set: same images, headlines, audience,
  placements, dates and budget as the short ad set. The copy is the only
  difference.
- Don't use Meta's multiple text options or dynamic creative for this. Meta
  mixes the variants itself and reports no fair comparison.
- Don't add it to a test that is already comparing something else (hooks,
  formats); two changes at once can't be read.
- Read both the result and the engagement over the same dates: cost per
  result, plus comments, shares, reactions and outbound CTR. Long copy often
  wins on engagement even when cost per result is close; say which one the
  person is optimising for before calling a winner.
- At small budgets this takes about two weeks. Report "no clear difference"
  when that's the honest read.

## Check Against The Backend

Meta's numbers are what Meta attributes. Compare reported conversions with the
source of truth for the same dates: store orders, app store or MMP installs,
CRM signups, billing. Flag a large or sudden gap and check the pixel,
Conversions API, SDK events and UTMs before trusting either number. Never scale
an ad Meta likes but the backend doesn't.

## Report Shape

Lead with:

- best performer,
- worst performer,
- spend,
- main signal,
- recommended action.

Then include:

- table of key metrics,
- creative diagnosis,
- audience/placement notes,
- budget recommendation,
- next creative tests.

## Decision Rules

Recommend "scale" only when:

- spend is meaningful,
- conversion quality is acceptable,
- the creative is not already fatiguing,
- landing page performance supports it.

Recommend "iterate" when:

- CTR is promising but conversion is weak,
- the hook works but the offer does not,
- comments or search terms reveal objections.

Recommend "pause" when:

- spend is meaningful and signals are poor,
- CPC or CPA is outside tolerance,
- the creative is attracting the wrong audience,
- the ad creates brand/compliance risk.

## Reporting Safety

- Do not overstate causality.
- Distinguish signal from noise.
- Mention small sample sizes.
- Never hide spend or poor performance.
- Make the next action concrete.
