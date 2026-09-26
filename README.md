# @getbutters/js

Send events and identify users to GetButters from the browser.

## Install

```bash
npm install @getbutters/js
```

```js
import { init, track, identify, reset } from '@getbutters/js'

init({ key: 'pk_…' })
```

### Or with a script tag

```html
<script
  src="https://cdn.jsdelivr.net/npm/@getbutters/js@0.1.0/dist/butters.min.js"
  integrity="sha384-PLACEHOLDER-REPLACE-WITH-THE-HASH-JSDELIVR-SHOWS"
  crossorigin="anonymous"
></script>
<script>
  butters.init({ key: 'pk_…' })
</script>
```

Pin the exact version in the URL rather than `@latest`, and add the
`integrity` and `crossorigin` attributes above using the SRI hash jsDelivr
shows for that file (append `?meta` to the file's jsDelivr URL, or check the
copy button on the package's jsDelivr page). That hash is a placeholder here;
copy the real one for the version you use. With it in place, a compromised
CDN can't swap the script out from under you, since the browser will refuse
to run anything that doesn't match the hash.

## Keys

Use a *publishable* key (`pk_…`) from your GetButters API page, never a
secret `ev_…` key. A publishable key can only send events and identify users
for the one project it belongs to. It can't trigger notifications or set
event times, and it's rate limited to 60 requests a minute per visitor. Set
allowed origins on the key in the API page to stop other sites from using it.

## API

Calls made before `init()` are silently ignored — there's no debug output
for this case, because `debug` is itself an option passed to `init()`.
No call ever throws.

### `init(options)`

```js
init({
  key: 'pk_…', // required, a publishable key
  host: 'https://app.getbutters.com', // optional, defaults shown
  pageviews: false, // optional, see Pageviews below
  debug: false, // optional, console.warn on failures
})
```

### `track(category, title, fields?)`

```js
track('order', 'Checkout completed', {
  description: 'Plan upgraded to Pro',
  icon: '🎉',
  tags: { plan: 'pro' },
  metadata: { amount: 4900 },
  url: location.href,
})
```

`track` automatically adds the identified user's id to the event, if one has
been set with `identify()`. Events sent before `identify()` has run have no
user attached.

### `identify(userId, properties?)`

```js
identify('user_123', { email: 'ada@example.com', plan: 'pro' })
```

### `reset()`

```js
reset()
```

`reset()` forgets the stored user id, even on pages that never called
`init()`. Call it from your logout handler so the next visitor on a shared
device isn't attributed to the previous one.

`_resetForTests` is also exported, but it's internal — it exists only so the
SDK's own test suite can reset module state between tests, and it isn't part
of the public API.

## Pageviews

Off by default. Turn it on with:

```js
init({ key: 'pk_…', pageviews: true })
```

When enabled, a `pageview` event fires on load and on every client-side
navigation (pushState, replaceState, and popstate). Each pageview counts
toward your monthly event quota.

What's sent:

- **title** — the pathname only (e.g. `/pricing`), never the full URL.
- **url** — the origin and pathname, with only `utm_*` query parameters kept.
  Every other query parameter is dropped, since it can carry tokens or
  personal data. The hash is always dropped.
- **page_title** — the document title, truncated to 200 characters.
- **referrer** — included only on the first pageview of the session, and
  only when it's from another site.
- **utm** — any `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` or
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
`package.json`. The `release` workflow tests, builds and publishes to npm,
and needs an `NPM_TOKEN` repository secret.

## License

MIT
