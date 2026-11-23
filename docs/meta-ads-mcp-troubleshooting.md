# Meta Ads MCP: What Can Go Wrong

Notes from a real app install launch through Meta's hosted Ads MCP server
(`https://mcp.facebook.com/ads`), November 2026. Meta is rolling the server out
gradually, so some of this will change. Check what your account allows before
you plan around it.

## The short version

The agent can build everything, including each ad's headline, description and
all three image sizes. A human then has two small jobs in Ads Manager: upload
the images, and save one change on each **ad set** to clear an error the MCP
server leaves on every ad. Don't edit the ads themselves.

1. The agent checks the ad account, Page and Instagram account. If the brand's
   Instagram account isn't linked to the ad account, link it first (see
   "Instagram account is missing" below).
2. The agent creates the campaigns and ad sets as paused drafts. For an iOS
   app, each campaign is created as an iOS 14+ campaign
   (`is_skadnetwork_attribution: true` and the app in the campaign's
   `promoted_object`), and each ad set lists `publisher_platforms` without
   Audience Network. Neither can be skipped: see "Campaign only reaches old
   iPhones" below.
3. A human uploads every image size into the ad account (see "Getting images
   into the ad account").
4. The agent creates each ad with the primary text, headline, description, App
   Store link, Install button and a different image per placement (see "The
   creative that survives").
5. A human reloads Ads Manager (Cmd+Shift+R), opens each **ad set**, makes one
   real change and saves. This clears error #1885183 on every ad in that ad set
   and leaves the ads untouched.
6. The agent reads the drafts back and runs `scripts/check-meta-drafts.mjs`
   against the manifest. Every ad should pass.
7. A human reviews and publishes.

## Error #1885183: "created by an app that is in development mode"

Every ad the MCP server created or changed was flagged with this:

> Ads creative post was created by an app that is in development mode: Ads
> creative post was created by an app that is in development mode. It must be
> in public to create this ad. (#1885183)

In Ads Manager it shows on the ad as "Review 1 error" or "Verifying your
changes", and it blocks publishing.

**It is not your Meta app.** The "app" is the one the MCP server itself runs
through. The same error came back for an ad that linked to a website with no app
attached, so switching your own Meta app to Live does not clear it. (Set your app
to Live anyway if you run app install ads; it's needed for other reasons.)

**What clears it: one real change on the ad set.** Open the ad set (not the ad)
in Ads Manager, change something and save. Meta re-checks every ad in that ad
set and the error goes, without touching the ads' text or images. In Australia,
completing the "Review requirements" task under Audience was the change; any
real edit to the ad set should do. Looking at it, scrolling or clicking around
does not count.

**Don't fix it by editing the ad.** Saving a change on the ad also clears the
error, but Ads Manager rewrites the creative as a plain single-image ad: the
headline, the description and every image except the first are dropped. If that
has already happened, have the agent send the creative again, then save a change
on the ad set.

**Any creative change from the agent brings the error back.** Do all creative
work through the agent first, and the ad-set step last.

Edit each ad set on its own. With several items selected, Ads Manager showed
"Your selection has multiple apps that can't be edited together" and the app
store as "Unknown".

What happens in the tools:

- `ads_create_creative` fails outright with this error, so no reusable creative
  is made.
- `ads_create_ad` and `ads_update_entity` with an inline creative succeed as
  drafts, but the draft ad carries the error in `active_errors`. Read it with
  `ads_get_ad_entities` and `object_state=draft`: affected ads show
  `validation_status: HAS_ERRORS`; cleared ones show `VALIDATED` or
  `NEEDS_VALIDATION` with no errors.
- `ads_get_ad_preview` still works on the draft ad, so you can check copy and
  images before the human step.

## The creative that survives

Send each ad's creative inline (in `ads_create_ad`, or `ads_update_entity` on a
draft ad) as an `object_story_spec` holding only the Page (and Instagram
account), plus an `asset_feed_spec` with `optimization_type: PLACEMENT`. This
carries the headline, description and a different image per placement, and it
survives the ad-set step:

```json
{
  "object_story_spec": { "page_id": "<PAGE_ID>", "instagram_user_id": "<IG_ID>" },
  "asset_feed_spec": {
    "images": [
      { "hash": "<HASH_4x5>", "adlabels": [{ "name": "feed_4x5" }] },
      { "hash": "<HASH_9x16>", "adlabels": [{ "name": "story_9x16" }] },
      { "hash": "<HASH_1x1>", "adlabels": [{ "name": "square_1x1" }] }
    ],
    "bodies": [{ "text": "<primary text>" }],
    "titles": [{ "text": "<headline>" }],
    "descriptions": [{ "text": "<description>" }],
    "link_urls": [{ "website_url": "<App Store URL>" }],
    "call_to_action_types": ["INSTALL_MOBILE_APP"],
    "ad_formats": ["SINGLE_IMAGE"],
    "optimization_type": "PLACEMENT",
    "asset_customization_rules": [
      {
        "customization_spec": {
          "publisher_platforms": ["facebook", "instagram"],
          "facebook_positions": ["story", "facebook_reels"],
          "instagram_positions": ["story", "reels"]
        },
        "image_label": { "name": "story_9x16" },
        "priority": 1
      },
      {
        "customization_spec": { "publisher_platforms": ["facebook"], "facebook_positions": ["right_hand_column"] },
        "image_label": { "name": "square_1x1" },
        "priority": 2
      },
      { "customization_spec": {}, "image_label": { "name": "feed_4x5" }, "priority": 3 }
    ]
  }
}
```

The simpler `link_data` form (`message`, `name`, `description`, one
`image_hash`) also works and keeps its headline through the ad-set step, but it
holds one image only. Don't set `link_title` on the button: Meta rejects it as
deprecated (#1815589) and says to use `name` and `description` instead.

## Instagram account is missing (#1772103)

The placement format above needs an Instagram identity on each ad:

> Instagram account is missing: Select an Instagram account or Facebook Page to
> represent your business on Instagram. (#1772103)

Link the brand's Instagram account to the Page and to the ad account (Business
Settings → Instagram accounts), check it appears in `ads_get_ig_accounts`, and
pass its ID as `instagram_user_id` in `object_story_spec`. The MCP server cannot
choose "use the Facebook Page" for Instagram; that is only offered in Ads
Manager on the ad itself, and editing the ad drops the headline (see above).

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
- **Instagram identity.** The simple one-image ad ran under the Page name
  without an Instagram account; the placement format needs one (see above).
- **Advantage+ audience** is turned on by default for new ad sets. With only
  countries and OS set, that is still broad targeting.

## Campaign only reaches old iPhones

An iOS app campaign created without the iOS 14+ setting is accepted with no
error and no warning. Meta then shows it only to iPhones on iOS 14.4 or
earlier, which in practice is almost nobody. Signs:

- In Ads Manager, the ad set's **Mobile app store** reads "Apple App Store (iOS
  13.7 or earlier)" and is greyed out, and **Attribution model** reads
  "Standard" instead of SKAdNetwork or AEM.
- Through the API, the ad set's targeting reads back `user_os:
  ["iOS_ver_2.0_to_14.4"]`.
- Facebook and Instagram barely deliver, spend drifts to Audience Network, and
  installs stay at zero while the Facebook SDK reports installs from other
  sources.

It can't be fixed in place: the setting exists only at creation. Build new
campaigns with it on, copy the ad sets and ads across, then turn the old
campaigns off (don't delete them, so their numbers stay).

## Checks before handing over

- Read the draft back with `ads_get_ad_entities` (`object_state=draft`), save it
  to a file and run:

  ```sh
  node scripts/check-meta-drafts.mjs --drafts drafts.json --manifest output/<round>/manifest.json --store-url <App Store URL>
  ```

  It fails on a missing ad, any Meta error, and a missing or changed primary
  text, headline, description, button or link. It warns on single-image ads and
  on ads that aren't in the manifest (a throwaway ad left behind, for example).
- For iOS: no ad set reads back `iOS_ver_2.0_to_14.4` (the check above fails
  on it), and no ad set includes Audience Network unless the human chose it.
- Both campaigns staged `PAUSED`.
- A preview link for each ad, checked by a human.
