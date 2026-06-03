import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const errorJson = (c: Context, message: string, status: ContentfulStatusCode) =>
  c.json({ error: message }, status)
