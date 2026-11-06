# Example Brief: Site Visit App

Product: Fieldbook, a free iPhone and iPad app for logging site visits, with
notes, photos, and a checklist kept together. (Fieldbook is a made-up brand used
across the examples in this repo.)

Audience:

- site supervisors,
- property inspectors,
- facilities managers,
- small trade businesses visiting several sites a day.

Core promise:

- log every visit in seconds while still on site,
- find any note or photo again later,
- share a clean visit record with the team.

Creative angles:

- "Stop losing site notes in the camera roll."
- "Every site visit, in one list."
- "Log it before you leave the site."
- "Notes, photos, and the checklist in one place."
- "Do the paperwork on site, not at 9 pm."

Competitor research seeds:

- field service and inspection apps,
- construction and facilities management tools,
- note-taking apps used on site,
- trade and property advertisers in the Meta Ads Library,
- forums where supervisors describe their paperwork pain.

Offer hypotheses:

- free app with unlimited visits,
- Team plan for shared visit history,
- Pro plan with PDF visit reports,
- free trial of Team for new workspaces.

Primary conversion:

- app install,
- first visit logged,
- team invite sent,
- plan upgrade.

Brand constraints:

- practical and plain-spoken,
- no unsupported time-saving claims,
- no fake testimonials,
- keep visuals grounded in real on-site workflows.

3D device creative direction:

- Use a model-rendered 3D iPhone or iPad for the physical device angle.
- Do not create fake 3D device depth with deterministic code or perspective
  warping.
- Keep the device angle natural: the phone should lean toward the viewer with a
  thin metal side edge, realistic bevel, glass reflection, and contact shadow.
- Reject outputs with a thick black side slab, visible cutout plate, floating
  device, impossible shadow, or rewritten app UI.
- Use deterministic layout only for exact brand text, CTA, final crop, contact
  sheet, and export.
- Preferred scene styles:
  - site office desk with plans, hi-vis vest, and a phone,
  - building walkthrough in natural daylight,
  - van dashboard between site visits,
  - clean navy-and-yellow workbench with a tablet.

Brand-agnostic job shape:

```yaml
brand:
  name: "Fieldbook"
  url: "https://example.com"
  logo: "use supplied brand logo or fetch from brand URL"
  typography: "bold sans headline, clean sans body"
product:
  screenshots:
    - "real iPhone visit list screenshot"
  offer: "Free iOS site visit log"
  cta: "Install Free"
audience:
  segment: "site supervisors, inspectors, and facilities managers"
asset:
  aspectRatio: "4:5"
  style: "premium 3D on-site lifestyle"
  provider: "runtime-selected image model"
```
