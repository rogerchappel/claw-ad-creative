# Meta Ads MCP: What Can Go Wrong

Notes from a real app install launch through Meta's hosted Ads MCP server
(`https://mcp.facebook.com/ads`), November 2026. Meta is rolling the server out
gradually, so some of this will change. Check what your account allows before
you plan around it.

## The short version

The MCP server can build the campaign and ad sets on its own. The ads it makes
may need a human to open each one in Ads Manager, make a real edit and save it
before they can be published. Plan for that step.

1. The agent creates the campaign and ad sets as paused drafts.
2. A human uploads the images into the ad account (see below).
3. The agent creates the ads, with the images, copy and App Store link.
4. A human reloads Ads Manager, opens each ad, adds the 9:16 and 1:1 images per
   placement and saves. This clears the error described next.
5. A human reviews and publishes.

## Error #1885183: "created by an app that is in development mode"

Every ad the MCP server created was flagged with this:

> Ads creative post was created by an app that is in development mode: Ads
> creative post was created by an app that is in development mode. It must be
> in public to create this ad. (#1885183)

In Ads Manager it shows on the ad as "Review 1 error" or "Verifying your
changes", and it blocks publishing.

**It is not your Meta app.** The "app" is the one the MCP server itself runs
through. The same error came back for an ad that linked to a website with no app
attached, so switching your own Meta app to Live does not clear it. (Set your app
to Live anyway if you run app install ads; it's needed for other reasons.)

**What clears it:** open the ad in Ads Manager, make a real change to the
creative and save. Ads Manager then rebuilds the ad as its own and the error
goes. Opening the ad, scrolling and clicking around does not clear it; only a
change does. Adding the 9:16 and 1:1 images per placement counts as a real
change, and you need to do that anyway (see below), so do both at once.

Edit each ad on its own. With several ads selected, Ads Manager showed "Your
selection has multiple apps that can't be edited together" and the app store
as "Unknown", so a bulk edit is not a reliable way to clear the error.

What happens in the tools:

- `ads_create_creative` fails outright with this error, so no reusable creative
  is made.
- `ads_create_ad` with an inline `object_story_spec` succeeds as a draft, but the
  draft ad carries the error in `active_errors`. Read it with
  `ads_get_ad_entities` and `object_state=draft`: affected ads show
  `validation_status: HAS_ERRORS`, and fixed ones show `VALIDATED`.
- `ads_get_ad_preview` still works on the draft ad, so you can check copy and
  images before the human step.

## Ads made by the agent don't show in Ads Manager

If Ads Manager was already open while the agent created ads, it kept showing the
old draft. The ads were missing from the editor's side panel, and clicking an
ad set showed another ad set's ad. A full reload (Cmd+Shift+R) brought them all
in.

## Getting images into the ad account

The ads tools read the **ad account's** image library only. They cannot see the
Business Media Library (Business Suite → Media Library, or the
`asset_library/business_creatives` page), even when it's the same business.

What failed:

- `ads_create_upload_url` returned "This tool is new and is being gradually
  rolled out" for the account.
- Images uploaded to a folder in the Business Media Library didn't appear in
  `ads_get_ad_images`.

What worked: in Ads Manager, start a throwaway ad in any ad set, open the image
picker and click **Upload**. Pick every file at once. They land in the picker's
**Account** tab, which is the library the tools read. Cancel the picker, delete
the throwaway ad, then ask the agent to list images with `ads_get_ad_images`.

Name files so the agent can match them: `<creative-id>_<size>.png`, for example
`h09-status_4x5.png`. Meta re-encodes uploads, so the image hashes won't match a
local MD5. Match on names.

## One image per ad, then add the rest by hand

Placement-specific images (4:5 for feeds, 9:16 for Stories and Reels, 1:1
elsewhere) need `ads_create_creative` with `placement_customizations`, which hit
the error above. The inline route takes one image. Create each ad with its 4:5
image and add the other sizes in Ads Manager during the step that clears the
error.

## Other things that differed from the plan

- **No UTMs on app install ads.** App promotion ads go straight to the App
  Store. Meta's docs say there's no URL parameters field for this objective;
  tracking parameters only apply to deferred deep links. Measure through the
  Meta SDK and SKAdNetwork instead.
- **Drafts publish as active.** A draft campaign publishes `ACTIVE` unless you
  stage `{"status":"PAUSED"}` on it with `ads_update_entity` first. Do that if a
  human is meant to switch it on.
- **`ads_duplicate_entity` may be switched off** for the account ("not available
  for this ad account yet"). Copy ads in Ads Manager instead.
- **Instagram identity.** If the brand's Instagram account isn't linked to the
  ad account, `ads_get_ig_accounts` won't list it and Instagram placements run
  under the Page name. Link it before launch.
- **Advantage+ audience** is turned on by default for new ad sets. With only
  countries and OS set, that is still broad targeting.

## Checks before handing over

- `ads_get_ad_entities` with `object_state=draft`: every ad `VALIDATED`, no
  `active_errors`.
- Both campaigns staged `PAUSED`.
- No throwaway ads left in an ad set.
- A preview link for each ad, checked by a human.
