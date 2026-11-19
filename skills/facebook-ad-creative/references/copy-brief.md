# Cold-Traffic Copy Brief

Read before writing for people who have never heard of the brand. Warm
audiences (site visitors, app users, past buyers) already know the product and
can be shown the product and offer straight away. Cold audiences can't: they
know their problem, have often tried a fix or two, and are more sceptical with
each one that failed. An ad that opens on the product, price or offer asks them
to care before they have a reason to.

The brief decides **what** the ad says. A reference ad decides **the order and
rhythm**. Writing comes last and is mostly filling in blanks. Most weak AI copy
comes from skipping the brief and asking the model to guess the psychology.

## Four Jobs Before The Product

A cold ad does four jobs, in order, and each one is done with reasons the buyer
already accepts. None of them is "sell the product".

| Job | The buyer ends up thinking |
|---|---|
| 1. Attention | "This is worth my next 15 seconds." |
| 2. Belief | "So that's why it never worked, and here's what would." |
| 3. Value | "This product is the sensible place to get that." |
| 4. Action | "Doing nothing is the riskier choice, and now is the time." |

## The Brief: 17 Questions

Answer every row before writing. If a row has no honest answer, mark it
`[ASK]` or `[PROOF NEEDED]` and leave it out of the ad rather than invent one.

| Job | Element | Question to answer |
|---|---|---|
| Attention | Format | What does the ad look like so it reads as content, not an ad? (note, chat, POV clip, explainer, review card) |
| Attention | Topic | What subject does this buyer already care about this week? |
| Attention | Concept | In one line, what happens in this ad, and why can't they leave before it ends? |
| Attention | Visual hook | What in the first frame breaks the scroll and still fits the concept? |
| Attention | Copy hook | What first line makes the concept impossible to ignore? |
| Belief | Recognition | What shows we understand their situation as well as they do? |
| Belief | Suspected cause | What do they already blame for the problem? |
| Belief | Real cause | What missing piece confirms that suspicion and explains why it keeps happening? |
| Belief | What has to change | What must happen to fix it, and why the usual fixes don't do that? |
| Belief | What does it | Which approach makes that change, and what proves it? |
| Belief | Why it's hard to get | Why can't they get this from the obvious alternatives? |
| Value | Why this product | Why is this product the best (or only) way to get it under the right conditions? |
| Value | Features | Which features raise the odds of success, make the result feel real, cut the effort, or shorten the wait? Drop any feature that does none of these |
| Value | Cost comparison | Why does living with the problem cost more (money, time, stress) than the price? |
| Action | Risk comparison | Why is not acting riskier than acting? (free tier, trial length versus time to results, guarantee) |
| Action | Gain by acting now | What do they get by starting today? Only if true |
| Action | Loss by waiting | What do they lose by putting it off? Only if true (a real deadline, a real event) |

For short static ads, the brief still gets filled in, but each ad carries one
or two rows (usually the copy hook plus one Belief row). The full sequence fits
video scripts, landing pages and long primary text.

## Process

### 1. Facts

Collect what is already true, from the product page and `brand-brief.md`:
name, what it does, features, price and plans, free tier or trial, guarantee,
and any real reason to act now (a launch, a season, an event date). Nothing
goes into the ad that isn't on this list.

### 2. Target: market, segment, buyer

- **Market:** a group who share one desire. Many products serve several.
  Pick one per ad. Choose with evidence, not taste: where competitors' and
  your own long-running ads cluster on the research board. Drop a market with
  fewer than about three active advertisers; it is usually untested, not open.
- **Segment:** a cluster inside the market that also shares a condition,
  identity or behaviour (for example "first-time landlords with one
  property" rather than "people who rent out property"). Take it from what is already winning, or from
  community research (forums, Reddit, reviews, comments) for one nobody serves.
- **Buyer profile**, in two layers:
  - *What they want and fear:* main desire, main problem, the wins they expect
    after, how the problem shows up day to day, what success looks like to
    them, what they fear if it never gets solved.
  - *Who they are:* demographics; behaviour (what they watch, read and follow,
    which competitor ads catch them, what's in their news this month);
    perspective (beliefs, biases, who they see as enemies and allies, the
    words they use).

Spend little time re-deriving wants and fears. They change slowly, and
winning ads in the category (any year) already encode them; mine those and
real customer words. Spend the research time on **behaviour**: current events,
topics and formats are where new concepts and hooks come from.

### 3. Brief

Fill in the 17 questions with what this buyer already believes and wants to
hear, in the way they want to hear it, from the kind of person they'd listen
to. Two rules:

- **Connect dots they already accept.** The strongest real cause usually
  confirms what the buyer already suspects, with one missing link added. It
  doesn't ask them to adopt a new worldview.
- **Borrow proven structures.** Pick the hook structure from long runners on
  the research board, then fill it with this category's words. Inventing a
  structure is a bet; borrowing one isn't.

### 4. Write

1. Pick a reference: a long-running ad in a format that suits the concept.
2. Break it into blocks by job (hook, recognition, cause reveal, what fixes it,
   product, proof, offer, close) and note each block's length and rhythm.
3. Write each block from the brief. The reference gives order and pacing,
   never words.
4. Run `npm run creative:overlap` against the research board, then the
   pre-launch check in `creative-strategy.md` and `compliance.md`.

## Size The Bets

Each new, unproven choice in an ad is a bet. Reuse what is already proven
where leverage is low (market, segment, the cause the buyer already believes)
and spend bets where leverage is high (concept, format, visual hook).

| Risk | New bets in the ad | Share of a batch |
|---|---|---|
| Conservative | 0 to 1 | A few |
| Moderate | 2 | Most |
| Aggressive | 3 or more | Some |

Label each concept's risk in the approval pack. Most aggressive ads lose; the
one that wins usually pays for the rest and lifts the account to a new level.

## For Software And Services

The same brief works when the "cause" is a workflow rather than a body:

- *Suspected cause:* "I'm disorganised" or "I don't have time".
- *Real cause:* the information lives in five places, so nothing gets compared.
- *What has to change:* one record per item, captured at the moment of judgement.
- *What does it:* the product's capture flow, shown in a screen recording.
- *Risk comparison:* free tier or trial length set against how long one real
  use takes.

## Lines This Brief Never Crosses

The brief makes ads more persuasive, so the limits in `compliance.md` apply to
every row: causes and mechanisms must be true and sourced, fear stays
proportionate and never targets medicines or health decisions, urgency and
scarcity must be real, and nobody on screen is sexualised or posing as an
expert or customer they aren't.
