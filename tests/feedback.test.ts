import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { createFeedbackWidget, type FeedbackWidget } from '../src/feedback'
import { _resetForTests, identify, init } from '../src/index'

let widget: FeedbackWidget | undefined
const realFetch = globalThis.fetch
const root = () => document.querySelector('[data-butters-feedback]')?.shadowRoot as ShadowRoot
const field = () => root().querySelector('textarea') as HTMLTextAreaElement
const form = () => root().querySelector('form') as HTMLFormElement
const status = () => root().querySelector('[role="status"]') as HTMLElement
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const submit = () => form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

beforeEach(() => {
  _resetForTests()
  globalThis.fetch = mock(async () => new Response(null, { status: 201 })) as unknown as typeof fetch
})
afterEach(() => {
  widget?.destroy()
  widget = undefined
  globalThis.fetch = realFetch
  _resetForTests()
})

describe('feedback widget', () => {
  test('opens a labelled native dialog and restores launcher focus', () => {
    widget = createFeedbackWidget({ key: 'pk_test' })
    const launcher = root().querySelector('.launcher') as HTMLButtonElement
    launcher.focus()
    launcher.click()
    const dialog = root().querySelector('dialog') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute('aria-labelledby')).toBe('feedback-heading')
    expect(root().activeElement).toBe(field())
    const send = root().querySelector('.send') as HTMLButtonElement
    send.focus()
    send.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(root().activeElement).toBe(field())
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(root().activeElement).toBe(send)
    widget.close()
    expect(dialog.open).toBe(false)
    expect(root().activeElement).toBe(launcher)
    widget.open()
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(dialog.open).toBe(false)
  })

  test('sends trimmed feedback as an event with the identified user and optional clean URL', async () => {
    init({ key: 'pk_test' })
    await identify('alice')
    const calls: { target: string; body: unknown; headers: unknown }[] = []
    globalThis.fetch = mock(async (target: string, options: RequestInit) => {
      calls.push({ target, body: JSON.parse(String(options.body)), headers: options.headers })
      return new Response(null, { status: 201 })
    }) as unknown as typeof fetch
    window.history.replaceState(null, '', '/pricing?token=private#secret')
    widget = createFeedbackWidget({ key: 'pk_test', includePageUrl: true })
    widget.open()
    field().value = '  Pricing could be clearer.  '
    submit()
    await flush()
    expect(calls).toEqual([
      {
        target: 'https://app.getbutters.com/api/events',
        headers: { Authorization: 'Bearer pk_test', 'Content-Type': 'application/json' },
        body: {
          category: 'feedback',
          title: 'User feedback',
          description: 'Pricing could be clearer.',
          user_id: 'alice',
          url: 'https://example.com/pricing',
        },
      },
    ])
    expect(field().value).toBe('')
    expect(status().textContent).toContain('was sent')
    window.history.replaceState(null, '', '/')
  })

  test('rejects blank/oversized input without sending and does not render user HTML', async () => {
    widget = createFeedbackWidget({ key: 'pk_test', heading: '<script>bad()</script>' })
    widget.open()
    field().value = '   '
    submit()
    await flush()
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(status().getAttribute('aria-live')).toBe('assertive')
    expect(root().querySelector('script')).toBeNull()
    field().value = 'a'.repeat(2001)
    submit()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  test('failed submissions retain the message and can be retried', async () => {
    globalThis.fetch = mock(async () => new Response(null, { status: 429 })) as unknown as typeof fetch
    widget = createFeedbackWidget({ key: 'pk_test' })
    field().value = 'Keep this message'
    submit()
    await flush()
    expect(field().value).toBe('Keep this message')
    expect(status().textContent).toContain('Wait a moment')
    expect(field().disabled).toBe(false)
    globalThis.fetch = mock(async () => new Response(null, { status: 201 })) as unknown as typeof fetch
    submit()
    await flush()
    expect(field().value).toBe('')
  })

  test('prevents duplicate submits while a request is pending and destroy aborts it', async () => {
    let signal: AbortSignal | undefined
    globalThis.fetch = mock(async (_target: string, options: RequestInit) => {
      signal = options.signal as AbortSignal
      return await new Promise<Response>((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      )
    }) as unknown as typeof fetch
    widget = createFeedbackWidget({ key: 'pk_test' })
    field().value = 'Hello'
    submit()
    submit()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(form().getAttribute('aria-busy')).toBe('true')
    expect(field().disabled).toBe(true)
    widget.destroy()
    await flush()
    expect(signal?.aborted).toBe(true)
    expect(document.querySelector('[data-butters-feedback]')).toBeNull()
    widget.open()
    expect(document.querySelector('[data-butters-feedback]')).toBeNull()
  })

  test('refuses secret keys and invalid hosts before mounting', () => {
    expect(() => createFeedbackWidget({ key: 'ev_secret' })).toThrow('publishable')
    expect(() => createFeedbackWidget({ key: 'pk_test', host: 'javascript:bad()' })).toThrow()
    expect(document.querySelector('[data-butters-feedback]')).toBeNull()
  })

  test('page URL collection is opt-in', async () => {
    let body: Record<string, unknown> | undefined
    globalThis.fetch = mock(async (_target: string, options: RequestInit) => {
      body = JSON.parse(String(options.body))
      return new Response(null, { status: 201 })
    }) as unknown as typeof fetch
    widget = createFeedbackWidget({ key: 'pk_test' })
    field().value = 'Hello'
    submit()
    await flush()
    expect(body?.url).toBeUndefined()
    expect(body?.user_id).toBeUndefined()
  })
})
