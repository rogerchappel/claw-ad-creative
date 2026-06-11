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
