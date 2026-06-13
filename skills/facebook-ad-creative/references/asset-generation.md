# Asset Generation

## Prompt Pack Fields

For every generated asset, record:

- concept name,
- intended placement,
- aspect ratio,
- prompt,
- negative prompt,
- source references,
- model,
- settings,
- seed if available,
- output filename,
- review notes.

## Static Image Prompt Pattern

Use this structure:

```text
Create a Meta ad image for [audience] promoting [offer].
Scene: [specific scene].
Subject: [main subject].
Composition: [mobile-first layout, focal point, negative space].
Brand feel: [tone].
Text area: leave clean space for [headline], do not render text.
Lighting/color: [specific].
Avoid: [competitor marks, fake UI, distorted anatomy, unreadable text].
Aspect ratio: [1:1 or 4:5 or 9:16].
```

Do not ask image models to render important small text. Add text later in a
design tool or controlled editor.

## Model-Rendered Device Mockups

For ads that need a realistic 3D phone, tablet, laptop, packaging, or physical
product angle, do not fake the device perspective with deterministic image
warping. Use an image model to render the physical scene, lighting, device
angle, bevels, side thickness, screen glass, and contact shadows.

Use deterministic layout code only for:

- exact brand text,
- exact CTA text,
- legal or offer disclaimers,
- final crop and export,
- file naming,
- contact sheets, and
- quality-control comparisons.

Default to this two-pass workflow:

1. Build a brand profile from the target brand URL or supplied brand kit:
   - brand name,
   - logo or mark source,
   - primary colors,
   - typography direction,
   - product screenshots,
   - audience,
   - offer,
   - required CTA,
   - forbidden claims or visual elements.
2. Generate a clean background/device plate with the model:
   - 3D-rendered phone or device already in the correct perspective,
   - real-world scene and props,
   - realistic bevel, side edge, screen reflection, and shadow,
   - blank or generic dark screen if the provider cannot preserve screenshot
     fidelity,
   - no rendered headline, CTA, logo, or small UI text unless intentionally
     testing fully model-native output.
3. If the provider supports image-conditioned edits with high screen fidelity,
   ask it to place the supplied screenshot on the device screen while preserving
   the device perspective and lighting. Reject any output where the UI text is
   rewritten, distorted, or semantically changed.
4. If the provider cannot preserve screenshot fidelity, use the model output as
   a physical plate and insert the screenshot only as a flat screen replacement.
   Do not add fake side-depth, bevels, or slabs in code; those must already be
   present in the generated plate.
5. Add brand/copy/CTA layers in a controlled editor or template.
6. Export a contact sheet plus full-size assets and record the provider, model,
   prompt, source screenshots, and rejection notes.

Use a model provider chosen by runtime configuration. Suitable providers include
fal.ai models, Higgsfield for premium motion or highly polished visual systems,
OpenAI image generation models exposed by the runtime, or another image model
connector such as Nano Banana when available. The workflow should not hard-code
one provider; the CLI should accept the provider/model as a job setting.

### Device Plate Prompt Pattern

Use this structure for model-rendered 3D device plates:

```text
Create a premium 4:5 Meta ad visual for [brand] targeting [audience].
Scene: [field, desk, studio, workplace, product environment].
Physical device: realistic 3D [iPhone/tablet/laptop] in [angle direction],
with visible side edge, glass reflection, bevels, and contact shadow.
Screen: [blank dark screen / supplied screenshot if image conditioning is
supported]. Preserve the screen perspective and do not invent UI text.
Props: [brand-relevant physical objects].
Composition: leave clean negative space for headline and CTA at [location].
Brand feel: [premium/practical/technical/playful/etc].
Lighting/color: [brand palette and scene lighting].
Avoid: fake cutout edges, floating device, impossible shadows, thick side slab,
warped UI, unreadable text, rendered logos, rendered CTA text, watermark.
Aspect ratio: [4:5, 1:1, 9:16].
```

For right-side phone placements, specify the physical angle explicitly. Example:

```text
The phone stands on the right side of the frame, angled slightly toward the
viewer with its left edge marginally closer to camera. Show a thin realistic
right-side metal edge and a soft table contact shadow. Do not create a thick
black slab or visible cutout behind the phone.
```

### Brand-Agnostic CLI Inputs

Every CLI job that generates branded device ads should accept a brand profile
instead of baking one client into the template:

```yaml
brand:
  name: "Brand Name"
  url: "https://example.com"
  logo: "path-or-url"
  colors:
    primary: "#123456"
    secondary: "#abcdef"
    accent: "#c49a4f"
  typography: "serif headline, clean sans body"
product:
  screenshots:
    - "path/to/screenshot.png"
  offer: "Free iOS catalogue viewer"
  cta: "Install Free"
audience:
  segment: "bloodstock agents"
asset:
  aspectRatio: "4:5"
  provider: "fal"
  model: "runtime-selected"
  style: "premium 3D field lifestyle"
```

The CLI should produce a prompt pack and an asset manifest even when generation
is delegated to an external model provider. Keep the output portable enough that
the same job can be rerun for a different brand by replacing only the brand
profile and screenshots.

## Video Prompt Pattern

Use this structure:

```text
Create a [duration] second vertical Meta ad video for [audience].
Opening 0-2s: [attention hook].
Middle: [demo/proof/benefit].
Final: [CTA moment].
Camera: [movement].
Style: [UGC/demo/cinematic/screen-recording hybrid].
No logos, no competitor assets, no unreadable text.
```

## Variants

Generate variants deliberately:

- hook variant,
- visual metaphor variant,
- audience segment variant,
- offer variant,
- format variant.

Do not generate dozens of random assets. Each variant should test a hypothesis.

## Review Checklist

Reject assets that:

- look fake in a way that harms trust,
- use competitor branding,
- imply impossible outcomes,
- confuse the product,
- hide the CTA,
- are too polished for the audience,
- are too generic to stop the scroll,
- do not match the landing page promise.
