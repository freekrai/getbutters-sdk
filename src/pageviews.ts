import type { TrackFields } from './index'

export type SendPageview = (title: string, fields: TrackFields) => void

export function startPageviews(_send: SendPageview): void {}

export function stopPageviews(): void {}
