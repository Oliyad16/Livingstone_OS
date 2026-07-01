#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { sql } from './db.js'
import { publishPost, orgShareStats, orgUrn, getConnection } from './linkedin.js'

// LinkedIn MCP for the Livingstone dashboard. Thin wrapper over the shared
// Neon DB (posts + linkedin_connection) and the dashboard's publish logic, so
// drafting/publishing from an MCP client uses the same connected account.

const server = new McpServer({ name: 'livingstone-linkedin', version: '0.1.0' })

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] })
const fail = (s: string) => ({ content: [{ type: 'text' as const, text: s }], isError: true })

server.tool(
  'linkedin_connection_status',
  'Report whether a LinkedIn account is connected, the posting mode (company page vs personal), token expiry, and the connected name.',
  {},
  async () => {
    try {
      const conn = await getConnection()
      const org = orgUrn()
      return text(
        JSON.stringify(
          {
            connected: Boolean(conn?.access_token),
            mode: org ? 'company-page' : 'personal',
            org_urn: org,
            member_urn: conn?.member_urn ?? null,
            name: conn?.name ?? null,
            token_expiry: conn?.expiry ?? null,
            has_refresh_token: Boolean(conn?.refresh_token),
          },
          null,
          2
        )
      )
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e))
    }
  }
)

server.tool(
  'linkedin_publish_now',
  'Publish a text post to LinkedIn immediately (company page if LINKEDIN_ORG_ID is set, else the connected member). Returns the LinkedIn post id.',
  { text: z.string().min(1).max(3000).describe('The post body. Plain text; LinkedIn renders line breaks.') },
  async ({ text: body }) => {
    try {
      const id = await publishPost(body)
      return text(`Published. LinkedIn post id: ${id}`)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e))
    }
  }
)

server.tool(
  'linkedin_create_draft',
  'Save a draft post to the dashboard posts table (status=draft). Optionally tag a topic and content pillar. Returns the draft id.',
  {
    body: z.string().min(1).describe('The draft post text.'),
    topic: z.string().optional().describe('Short topic label.'),
    post_type: z.enum(['ranking', 'news', 'education']).optional().describe('Content pillar (defaults to news).'),
    scheduled_for: z.string().optional().describe('ISO timestamp to schedule for (advisory; actual posting is driven by the cron/agent).'),
  },
  async ({ body, topic, post_type, scheduled_for }) => {
    try {
      const id = randomUUID()
      await sql`
        INSERT INTO posts (id, topic, body, status, scheduled_for, source, post_type)
        VALUES (${id}, ${topic ?? ''}, ${body}, 'draft', ${scheduled_for ?? null}, 'mcp', ${post_type ?? 'news'})
      `
      return text(`Draft saved. id: ${id}`)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e))
    }
  }
)

server.tool(
  'linkedin_list_drafts',
  'List draft and scheduled posts from the dashboard (most recent first).',
  { limit: z.number().int().min(1).max(50).optional().describe('Max rows (default 20).') },
  async ({ limit }) => {
    try {
      const rows = (await sql`
        SELECT id, topic, post_type, status, scheduled_for, left(body, 140) AS preview, created_at
        FROM posts
        WHERE status IN ('draft', 'scheduled')
        ORDER BY created_at DESC
        LIMIT ${limit ?? 20}
      `) as unknown[]
      return text(JSON.stringify(rows, null, 2))
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e))
    }
  }
)

server.tool(
  'linkedin_publish_draft',
  'Publish a stored draft by id to LinkedIn, then mark it posted and record the LinkedIn post id. Mirrors the dashboard\'s /api/posts/publish.',
  { id: z.string().describe('The posts.id of the draft to publish.') },
  async ({ id }) => {
    try {
      const rows = (await sql`SELECT id, body, status FROM posts WHERE id = ${id}`) as { id: string; body: string; status: string }[]
      if (rows.length === 0) return fail(`Post not found: ${id}`)
      if (rows[0].status === 'posted') return fail(`Post ${id} is already posted.`)
      const linkedinId = await publishPost(rows[0].body)
      await sql`UPDATE posts SET status = 'posted', posted_at = now(), linkedin_id = ${linkedinId} WHERE id = ${id}`
      return text(`Published draft ${id}. LinkedIn post id: ${linkedinId}`)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e))
    }
  }
)

server.tool(
  'linkedin_org_analytics',
  'Fetch lifetime company-page share statistics (impressions, clicks, engagement). Company-page mode only; requires page-admin scopes.',
  {},
  async () => {
    try {
      const stats = await orgShareStats()
      return text(JSON.stringify(stats, null, 2))
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e))
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
// stderr is safe for logs; stdout is the MCP transport.
console.error('livingstone-linkedin MCP server running on stdio')
