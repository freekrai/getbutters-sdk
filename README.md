# @getbutters/js

Send events and identify users to Get Butters from the browser.

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

For extra protection against a compromised CDN, add Subresource Integrity:
fetch the `integrity` hash jsDelivr publishes for that exact file and version
(append `?meta` to the file's jsDelivr URL, or use the copy button on the
package's jsDelivr page), then add it along with `crossorigin="anonymous"`:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@getbutters/js@0.1.0/dist/butters.min.js"
  integrity="sha384-…"
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
