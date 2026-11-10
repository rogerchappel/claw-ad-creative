# App Install Setup (iOS)

One-time setup before you can run app install ads on Facebook and Instagram and
count the installs they produce. Do the steps in order. Budget an afternoon for
the Meta side, plus one app release if your app doesn't yet report installs.

Where a step says **not confirmed**, Meta's public docs didn't state it when this
guide was written. Check it in your own account instead of trusting this page.

## What you end up with

| Thing | Where it lives | What it's for |
|---|---|---|
| Business portfolio | business.facebook.com | Owns everything below |
| Facebook Page (and optional Instagram account) | Business settings | The identity ads run from |
| Ad account with a payment method | Business settings | Pays for and holds the campaigns |
| Meta app with an iOS platform | developers.facebook.com/apps | Represents your App Store app to Meta |
| Install tracking in the app | Your Xcode project | Tells Meta when an ad led to an install |
| Agent access (MCP server or CLI) | Your machine | Lets an agent build and read campaigns |

## Quick answers

- **Do I need a Meta app?** Yes. An app install campaign promotes a Meta app ID
  that has your iOS app attached. This is separate from your App Store listing.
- **Do I need to add anything to my iPhone app?** Yes, if you want Meta to count
  installs and optimise for them. Meta says the Facebook SDK "is required to
  enable install tracking". The alternatives are the Conversions API for App
  Events or a mobile measurement partner. Without any of them you can only
  optimise for link clicks, which Meta calls a fallback.
- **How long does approval take?** Meta's docs state no review or approval wait
  for registering an iOS app for ads. The only stated delay is that events "may
  take up to 20 minutes to appear in the dashboard". Whether your account needs
  business verification or app review first is **not confirmed**; the App
  Dashboard tells you if it does.
- **Do I need a conversion value or purchase events?** No. Installs are enough
  to start. See "Optional: purchases and value" when you want more.

## Step 1. Business, Page and ad account

1. Go to business.facebook.com and create a business portfolio, or open yours.
2. In Business settings, add or create the Facebook Page your ads will run from.
   Connect an Instagram account if you want ads to show under your handle.
3. Add or create an ad account and give it a payment method.
4. Note the ad account ID (it starts with `act_` in API calls) and the Page ID.
   Keep them in your own config, not in a public repository.

## Step 2. Create the Meta app

1. Go to developers.facebook.com/apps and choose **Create app**.
2. If you plan to connect the Meta ads MCP server with your own app ID, add the
   use case **Create & manage ads with ads MCP server** while creating it.
3. Attach the app to your business portfolio when asked.
4. Note the **App ID** at the top of the dashboard. This is the `application_id`
   an install campaign promotes.

## Step 3. Add your iOS app to it

1. In the app dashboard open **Settings > Basic**.
2. Choose **Add Platform**, then **iOS**.
3. Enter your **Bundle ID** exactly as it appears in Xcode and App Store Connect.
4. Set **App Domains** to your App Store URL.
5. Add a **Privacy Policy URL**. Meta requires it to take the app public.
6. If the iOS panel shows an **iPhone Store ID** field, enter the numeric ID from
   your App Store URL (the digits after `id`). Meta's setup page doesn't mention
   this field, so treat it as **not confirmed**.
7. Save.

## Step 4. Link the ad account

1. Open **Settings > Advanced**.
2. Under **Authorized Ad Account IDs**, add your ad account ID.
3. In the **Advertising Accounts** panel choose **Get Started** and connect the
   app to your business.
4. While you're here, copy the **Client Token** (Settings > Advanced > Client
   Token). The SDK needs it in step 5.

## Step 5. Add install tracking to the app

Pick one route.

| Route | Use when |
|---|---|
| Facebook SDK for iOS | Default. Least work, logs installs automatically |
| Mobile measurement partner | You already use one and it sends events to Meta |
| Conversions API for App Events | You'd rather send events from your server |

Facebook SDK route:

1. In Xcode choose **File > Add Package Dependencies** and add
   `https://github.com/facebook/facebook-ios-sdk`. Select `FacebookCore`.
2. Add these keys to `Info.plist`, using your own values:

   ```xml
   <key>CFBundleURLTypes</key>
   <array>
     <dict>
       <key>CFBundleURLSchemes</key>
       <array>
         <string>fbYOUR_APP_ID</string>
       </array>
     </dict>
   </array>
   <key>FacebookAppID</key>
   <string>YOUR_APP_ID</string>
   <key>FacebookClientToken</key>
   <string>YOUR_CLIENT_TOKEN</string>
   <key>FacebookDisplayName</key>
   <string>Your App Name</string>
   ```

3. Initialise the SDK when the app launches:

   ```swift
   import FacebookCore

   func application(_ application: UIApplication,
                    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
       ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)
       return true
   }
   ```

   A SwiftUI app needs an app delegate adaptor to call this.

4. Ship the build to the App Store. Ads only count installs of a version that
   contains the SDK.

With that in place Meta says "app installs, launches, and in-app purchases are
automatically logged".

Privacy work that comes with it:

- Update the App Privacy answers in App Store Connect to cover the data the SDK
  collects.
- Decide whether to show Apple's App Tracking Transparency prompt. Older SDK
  guides also set `Settings.shared.isAdvertiserTrackingEnabled` from the answer;
  whether current SDK versions still need that call is **not confirmed**.
- On iOS, most install reporting arrives through Apple's privacy-preserving
  attribution (SKAdNetwork, AdAttributionKit) and Meta's Aggregated Event
  Measurement. Meta's developer pages for these returned errors when this guide
  was written, so the `SKAdNetworkItems` list, any campaign-count limits and the
  reporting delay are **not confirmed**. Events Manager shows what your app
  needs under its app settings.

## Step 6. Check installs are arriving

1. Install the new build on a test device and open it.
2. Open the App Ads Helper at developers.facebook.com/tools/app-ads-helper,
   pick your app and use **Test Event**.
3. Open Events Manager at facebook.com/events_manager2 and find the app's
   dataset. Installs and launches should show within about 20 minutes.
4. In the app dashboard, **Last Mobile Install Reported** should now have a date.

Don't start a campaign until step 3 shows events. A campaign optimising for
installs that can't see installs spends without learning.

## Step 7. Give your agent access

You can use either tool, or both. The MCP server suits conversational work
(reading results, small changes). The CLI suits scripted builds.

### Meta ads MCP server

Meta hosts it at `https://mcp.facebook.com/ads`. For Claude Code:

```sh
claude mcp add --transport http --client-id YOUR_META_APP_ID meta-ads https://mcp.facebook.com/ads
```

Then sign in through the Facebook login it opens and pick the ad account.

- Meta says owning an app "is not a prerequisite" for the connector, but the
  command above needs a client ID. If you use your own app, its redirect URL must
  match your MCP client in the app's Facebook Login for Business settings. The
  exact value is **not confirmed**; your MCP client reports it on the first
  failed sign-in.
- Minimum permissions: `ads_mcp_management` plus `ads_read` (reporting only) or
  `ads_management` (create and edit). `pages_show_list` and `instagram_basic`
  unlock the Page and Instagram tools.
- A system user token works only for a system user with the Employee role.
- Write tools create everything paused, and the client asks before activating.

### Meta Ads CLI

```sh
brew tap facebook/fb
brew trust facebook/fb
brew install facebook/fb/meta-ads
```

Or `pip install meta-ads` on Python 3.12 or later.

1. In Business settings create a system user and generate a token with
   `business_management`, `ads_management`, `pages_show_list`,
   `pages_read_engagement`, `pages_manage_ads` and `read_insights`.
2. In the folder you run commands from, create `.env` with `ACCESS_TOKEN` and
   `AD_ACCOUNT_ID`. Never commit it; it is a password to the ad account.
3. Run `meta auth status` to confirm it works.

Start with read-only use. Give an agent create access only once you're happy
with the approval rules in `running-app-install-ads.md`.

## Optional: purchases and value

Skip this until installs are flowing. It matters when your app sells something
(in-app purchases, subscriptions, Apple Pay checkouts) and you want Meta to find
buyers, not just installers.

1. **Log purchases.** The SDK logs in-app purchases automatically: all of them
   with StoreKit 1, and non-consumables and subscriptions with StoreKit 2.
   StoreKit 2 consumables also need `SKIncludeConsumableInAppPurchaseHistory` in
   `Info.plist`. Purchases outside StoreKit (Apple Pay for physical goods, web
   checkout) must be logged by hand with a purchase event carrying `value` and
   `currency`.
2. **Check them** in Events Manager the same way as installs.
3. **Optimise for the event.** In the ad set choose the app event (for example
   Purchase) as the goal. Through the API this is
   `optimization_goal=OFFSITE_CONVERSIONS` with a `promoted_object` holding
   `application_id` and `custom_event_type` (for example `PURCHASE`).
4. **Value optimisation** (`optimization_goal=VALUE`) asks Meta to chase
   higher-value buyers. Through the API it is allow-list only.
5. **Conversion value** is the number Apple's attribution passes back per
   install. You configure its mapping in Events Manager. It only matters once
   you optimise beyond installs.

Meta doesn't state a minimum event volume for these. As a working rule, stay on
installs until one ad set gets dozens of the deeper event a week.

## Checklist

- [ ] Business portfolio, Page and funded ad account exist
- [ ] Meta app created, iOS platform added with the right Bundle ID
- [ ] Ad account authorised on the app
- [ ] App Store build contains the SDK (or MMP / Conversions API)
- [ ] Installs visible in Events Manager
- [ ] Agent can read the ad account through the MCP server or CLI
- [ ] IDs and tokens stored in private config, not in a repository
