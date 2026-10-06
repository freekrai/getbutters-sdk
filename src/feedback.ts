import { readUserId } from './storage'

export interface FeedbackOptions {
  /** Publishable key scoped to the project that will receive feedback. */
  key: string
  host?: string
  category?: string
  title?: string
  buttonLabel?: string
  heading?: string
  /** Include origin + pathname in the event URL, without query or fragment. Off by default. */
  includePageUrl?: boolean
}

export interface FeedbackWidget {
  open(): void
  close(): void
  destroy(): void
}

const CSS = `
:host{font-family:system-ui,sans-serif;color:#17212b;font-size:16px;line-height:1.5}
*{box-sizing:border-box}button,textarea{font:inherit}button{cursor:pointer;min-height:44px;border-radius:10px;padding:10px 16px;border:1px solid #cbd5df;background:#fff;color:#17212b}
button:focus-visible,textarea:focus-visible{outline:3px solid #176eaf;outline-offset:3px}button:disabled{cursor:wait;opacity:.65}
.launcher{position:fixed;right:20px;bottom:20px;z-index:2147483646;background:#17212b;color:#fff;box-shadow:0 4px 18px #0002}
dialog{border:1px solid #d7dfe6;border-radius:16px;padding:24px;width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;background:#fff;color:#17212b;box-shadow:0 16px 64px #0003}
dialog::backdrop{background:#17212b66}h2{font-size:22px;margin:0 0 8px}p{margin:0 0 16px}label{display:block;font-weight:600;margin-bottom:8px}
textarea{width:100%;min-height:140px;resize:vertical;padding:12px;border:1px solid #9caebb;border-radius:8px;background:#fff;color:#17212b}
.actions{display:flex;gap:12px;justify-content:flex-end;margin-top:16px}.send{background:#17212b;color:#fff}.status{min-height:24px;margin-top:12px;font-size:14px}.error{color:#a51d24}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
`

/** Opt-in feedback UI. Call after the page body exists. */
export function createFeedbackWidget(options: FeedbackOptions): FeedbackWidget {
  if (typeof window === 'undefined' || !document.body) throw new Error('Feedback needs a browser document body')
  if (typeof options?.key !== 'string' || !options.key.startsWith('pk_') || options.key.length <= 3) {
    throw new TypeError('A publishable API key (pk_…) is required')
  }
  const url = new URL(options.host ?? 'https://app.getbutters.com')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError('host must be an HTTP(S) URL without credentials, query, or fragment')
  }
  const host = url.href.replace(/\/+$/, '')
  const key = options.key
  const category = options.category ?? 'feedback'
  const title = options.title ?? 'User feedback'
  if (!category || [...category].length > 100 || !title.trim()) throw new TypeError('A category and title are required')
  const includePageUrl = options.includePageUrl === true
  let destroyed = false
  let sending = false
  let active: AbortController | null = null
  let previousFocus: HTMLElement | null = null

  const mount = document.createElement('div')
  mount.dataset.buttersFeedback = ''
  const shadow = mount.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = CSS
  const launcher = document.createElement('button')
  launcher.className = 'launcher'
  launcher.type = 'button'
  launcher.textContent = options.buttonLabel ?? 'Feedback'
  launcher.setAttribute('aria-haspopup', 'dialog')
  const dialog = document.createElement('dialog')
  dialog.setAttribute('aria-labelledby', 'feedback-heading')
  const heading = document.createElement('h2')
  heading.id = 'feedback-heading'
  heading.textContent = options.heading ?? 'Send feedback'
  const intro = document.createElement('p')
  intro.textContent = 'What could work better? Share your thoughts with us.'
  const form = document.createElement('form')
  const label = document.createElement('label')
  label.htmlFor = 'feedback-message'
  label.textContent = 'Your feedback'
  const message = document.createElement('textarea')
  message.id = 'feedback-message'
  message.name = 'message'
  message.required = true
  message.maxLength = 2000
  message.setAttribute('aria-describedby', 'feedback-status')
  const status = document.createElement('div')
  status.className = 'status'
  status.id = 'feedback-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  const actions = document.createElement('div')
  actions.className = 'actions'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = 'Close'
  const send = document.createElement('button')
  send.type = 'submit'
  send.className = 'send'
  send.textContent = 'Send feedback'
  actions.append(cancel, send)
  form.append(label, message, status, actions)
  dialog.append(heading, intro, form)
  shadow.append(style, launcher, dialog)
  document.body.append(mount)

  const announce = (text: string, error = false) => {
    status.textContent = text
    status.className = error ? 'status error' : 'status'
    status.setAttribute('aria-live', error ? 'assertive' : 'polite')
  }
  const close = () => {
    if (destroyed || !dialog.open) return
    dialog.close()
    previousFocus?.focus()
  }
  const open = () => {
    if (destroyed || dialog.open) return
    previousFocus = (shadow.activeElement ?? document.activeElement) as HTMLElement | null
    dialog.showModal()
    if (message.disabled) cancel.focus()
    else message.focus()
  }
  launcher.addEventListener('click', open)
  cancel.addEventListener('click', close)
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })
  dialog.addEventListener('close', () => previousFocus?.focus())
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return
    const controls = [message, cancel, send].filter((control) => !control.disabled)
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && shadow.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && shadow.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (sending || destroyed) return
    const description = message.value.trim()
    if (!description || description.length > 2000) {
      announce('Enter feedback of 2,000 characters or fewer.', true)
      message.focus()
      return
    }
    sending = true
    send.disabled = true
    message.disabled = true
    form.setAttribute('aria-busy', 'true')
    announce('Sending…')
    const controller = new AbortController()
    active = controller
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const userId = readUserId()
      const response = await fetch(`${host}/api/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          title,
          description,
          ...(userId ? { user_id: userId } : {}),
          ...(includePageUrl ? { url: `${window.location.origin}${window.location.pathname}` } : {}),
        }),
        signal: controller.signal,
        redirect: 'error',
      })
      if (!response.ok) {
        if (response.status === 429) throw new Error('Too many requests. Wait a moment before trying again.')
        throw new Error('Could not send feedback. Please try again.')
      }
      if (!destroyed) {
        message.value = ''
        announce('Thank you. Your feedback was sent.')
      }
    } catch (error) {
      if (!destroyed)
        announce(
          error instanceof Error && error.name !== 'AbortError'
            ? error.message
            : 'Could not send feedback. Check your connection and try again.',
          true,
        )
    } finally {
      clearTimeout(timer)
      active = null
      sending = false
      send.disabled = false
      message.disabled = false
      form.removeAttribute('aria-busy')
    }
  })

  return {
    open,
    close,
    destroy() {
      if (destroyed) return
      close()
      destroyed = true
      active?.abort()
      mount.remove()
    },
  }
}
