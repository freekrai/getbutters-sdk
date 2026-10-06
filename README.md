# @getbutters/js

Send events and identify users to Get Butters from the browser or your server.

## Install

```bash
npm install @getbutters/js
```

```js
import { init, track, identify, reset } from '@getbutters/js'

init({ key: 'pk_…' })
```

### Or with a script tag

Paste this as-is:

```html
<script src="https://cdn.jsdelivr.net/npm/@getbutters/js@0.1.0/dist/butters.min.js"></script>
<script>
  butters.init({ key: 'pk_…' })
</script>
```

Pin the exact version in the URL rather than `@latest`, so an update to the
package can't change what runs on your site without you choosing to bump it.

For extra protection against a compromised CDN, add Subresource Integrity
along with `crossorigin="anonymous"`. The hash below is for 0.1.0; each
release publishes its own, so update both together when you bump the version:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@getbutters/js@0.1.0/dist/butters.min.js"
  integrity="sha384-geGe4yu6p4q4Q3ID8f7qkUSz2BVS7fQ9/c+YK77G7JUiXL7jRAEbgq4gFDkAPXrh"
  crossorigin="anonymous"
></script>
```

With `integrity` set, the browser refuses to run the file if its contents
don't match the hash, so a compromised CDN can't swap the script out from
under you.

### Content Security Policy

If your site sets a CSP, allow the SDK to reach your Get Butters project and,
if you use the script tag, allow loading it from jsDelivr:

```
Content-Security-Policy: connect-src https://app.getbutters.com; script-src cdn.jsdelivr.net
```

Replace `https://app.getbutters.com` with your `host` option if you set one.

## Keys

Use a *publishable* key (`pk_…`) from your Get Butters API page, never a
secret `ev_…` key. A publishable key can only send events and identify users
for the one project it belongs to. It can't trigger notifications or set
event times, and it's rate limited to 60 requests a minute per key and IP
address, not per visitor: everyone behind the same IP (an office, a campus
network) shares that budget. Set allowed origins on the key in the API page
to stop other sites from using it.

## API

Calls made before `init()` are silently ignored: there's no debug output for
this case, because `debug` is itself an option passed to `init()`. No call
ever throws.

### `init(options)`

```js
init({
  key: 'pk_…', // required, a publishable key
  host: 'https://app.getbutters.com', // optional, defaults shown, must include the scheme
  pageviews: false, // optional, see Pageviews below
  debug: false, // optional, console.warn on failures
})
```

A second call to `init()` is ignored, only the first `init()` on a page takes
effect. With `debug: true`, the ignored call logs a warning.

`init()` must run before `track()`, `identify()` or the pageviews feature can
do anything. Any of those calls made before `init()` are ignored entirely:
nothing is stored and nothing is sent, and a call to `identify()` made before
`init()` is not queued for later, it is simply dropped. Always call `init()`
first:

```js
init({ key: 'pk_…' }) // first
identify('user_123') // then this
```

### `track(category, title, fields?)`

```js
track('order', 'Checkout completed', {
  description: 'Plan upgraded to Pro',
  icon: '🎉',
  tags: { plan: 'pro' },
  metadata: { amount: 4900 },
  url: 'https://example.com/checkout',
})
```

`track` automatically adds the identified user's id to the event, if one has
been set with `identify()`. Events sent before `identify()` has run have no
user attached.

### `identify(userId, properties?)`

```js
identify('user_123', { email: 'ada@example.com', plan: 'pro' })
```

`userId` must be 1 to 200 characters. An id over 200 characters is rejected:
nothing is stored and nothing is sent, and with `debug: true` a warning is
logged.

### `reset()`

```js
reset()
```

`reset()` forgets the stored user id, even on pages that never called
`init()`. Call it from your logout handler so the next visitor on a shared
device isn't attributed to the previous one.

`_resetForTests` is also exported, but it's internal: it exists only so the
SDK's own test suite can reset module state between tests, and it isn't part
of the public API.

## Pageviews

Off by default. Turn it on with:

```js
init({ key: 'pk_…', pageviews: true })
```

When enabled, a `pageview` event fires on load and again whenever the
*pathname* changes via `pushState`, `replaceState` or `popstate`. A change to
only the query string or the hash doesn't count as a new pageview, so a
hash-based router (URLs like `/#/route`) only ever produces the initial
pageview; pageviews only fire while the tab is visible, and one made while
the tab is hidden fires once it becomes visible again.

What's sent:

- **title**: the pathname only (e.g. `/pricing`), never the full URL.
- **url**: the origin and pathname, with only `utm_*` query parameters kept.
  Every other query parameter is dropped, since it can carry tokens or
  personal data. The hash is always dropped.
- **page_title**: the document title, truncated to 200 characters.
- **referrer**: included only on the first pageview of each page load, and
  only when it's from another site.
- **utm**: any `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` or
  `utm_content` parameters present on the URL.

What's never collected: user agent, screen size, language, timezone,
location, session ids, time on page, or scroll depth.

## Server-side rendering

Safe to import in an SSR app. Every function checks for `window` first and
is a no-op when it isn't there, so importing or calling this SDK during a
server render does nothing and never throws.

## Development

```bash
bun install
bun test
bun run build
```

Releases are cut by pushing a tag like `v0.1.0` that matches the version in
`package.json`. The `release` workflow tests, builds and publishes to npm.

It authenticates to npm with `id-token: write` and npm's trusted publishing
(OIDC), which is the preferred setup: npm exchanges the workflow's short-lived
GitHub Actions token for a publish token itself, so there's no long-lived
`NPM_TOKEN` secret to leak or rotate. Configure trusted publishing for this
package and this workflow file on npmjs.com; an `NPM_TOKEN` repository secret
is only needed as a fallback if trusted publishing isn't set up.

## License

MIT
## Server SDK

Version `0.2.0` includes the browser, server, and feedback entry points.
Install `@getbutters/js@^0.2.0` to use the server client.

```js
import { Butters, ButtersError } from '@getbutters/js/server'

const butters = new Butters({
  key: process.env.BUTTERS_API_KEY, // secret ev_… key
  project: process.env.BUTTERS_PROJECT_ID,
})

await butters.identify('user_123', { plan: 'pro' })
const event = await butters.track('billing', 'Plan upgraded', {
  user_id: 'user_123',
  notify: true,
  metadata: { amount: 4900 },
})
await butters.setInsight('Queue depth', 10)
await butters.incrementInsight('Queue depth', -1)
```

Use this import only in server code with native `fetch` support. In Next.js,
use a route handler or server action; keep the key out of `NEXT_PUBLIC_`
environment variables and client components. The client refuses to run in a
browser. The browser import remains `@getbutters/js`, with publishable keys.

Each client has a fixed secret key and project. `identify()` does not change
the identity of later events: pass `user_id` on each event to keep concurrent
requests separate. No storage or automatic pageviews are used on the server.

- `track(category, title, fields?)` returns the created event. Fields:
  `description`, `icon`, `tags`, `metadata`, `url`, `user_id`, `notify`, and
  `created_at` (Unix seconds).
- `identify(userId, properties?)`, `setInsight(title, value, icon?)`, and
  `incrementInsight(title, amount, icon?)` return `{ ok: true }`.
- Options: `key`, `project`, optional `host` (default
  `https://app.getbutters.com`), and `timeoutMs` (default `10000`).
- Await every request before your serverless handler returns. Calls reject on
  failure. HTTP failures throw `ButtersError` with `status`, `message`, and
  `retryAfter` (the `Retry-After` header, or `null`). Network and timeout
  errors propagate. No automatic retries are made, since a retry can duplicate
  events or increments. Redirects are refused.

Run `bun run test:server` for the built package's Node HTTP integration tests.

## Feedback widget

The upcoming release includes an optional browser UI entry point:

```js
import { createFeedbackWidget } from '@getbutters/js/feedback'

const feedback = createFeedbackWidget({ key: 'pk_YOUR_PUBLISHABLE_KEY' })
// In a component's cleanup:
// feedback.destroy()
```

Call after the document body exists. The button opens a labelled native dialog
with a textarea, keyboard/focus support, and send status. Messages become
`feedback` / `User feedback` events. They are trimmed, limited to 2,000
characters, and retained on failure. `open()`, `close()`, and `destroy()`
control the widget; destroy also aborts pending requests.

Options: `key`, `host`, `category`, `title`, `buttonLabel`, `heading`, and
`includePageUrl` (off by default). When enabled, the URL contains only origin
and pathname. The browser SDK's stored user ID is attached when available.
No email/name collection or notification fan-out is added. Messages count
toward event quotas and publishable-key rate limits. Sends time out after 10
seconds and are not retried automatically.

The default browser import and CDN script do not include the widget. Sites
with a strict style Content Security Policy must permit its inline styles.
The feedback entry point is available starting with `@getbutters/js@0.2.0`.
