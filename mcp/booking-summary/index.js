#!/usr/bin/env node
/**
 * Minimal MCP server that exposes the cab-booking summary endpoint as a tool.
 *
 * It runs locally (stdio transport) so it can reach your Lando site on
 * localhost, fetches GET /api/bookings/summary with the shared token, and
 * returns the JSON. Cowork exposes it to artifacts as:
 *   mcp__cab-booking__get_booking_summary
 *
 * Configuration (environment variables):
 *   CAB_BOOKING_URL         Base site URL (default https://cab-booking.lndo.site)
 *   CAB_BOOKING_API_TOKEN   The token you set in settings.php (required)
 *   CAB_BOOKING_INSECURE_TLS Set to "1" to accept Lando's self-signed cert (dev only)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

if (process.env.CAB_BOOKING_INSECURE_TLS === "1") {
  // Accept Lando's local self-signed certificate. Dev only — never in prod.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const BASE_URL = (process.env.CAB_BOOKING_URL || "https://cab-booking.lndo.site").replace(/\/+$/, "");
const TOKEN = process.env.CAB_BOOKING_API_TOKEN || "";
const ENDPOINT = BASE_URL + "/api/bookings/summary";

const TOOL = {
  name: "get_booking_summary",
  description:
    "Fetch an aggregated, PII-safe summary of cab bookings from the Drupal app: " +
    "KPIs (today, pending 7d, confirmed 7d, revenue 7d), a 7-day per-day series, " +
    "status and car-type breakdowns, and the last 10 bookings with customer names " +
    "masked to initials. Use this to populate the booking dashboard.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

const server = new Server(
  { name: "cab-booking", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL] }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== TOOL.name) {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }] };
  }
  if (!TOKEN) {
    return {
      isError: true,
      content: [{ type: "text", text: "CAB_BOOKING_API_TOKEN is not set for this MCP server. Add it to the server's env config." }],
    };
  }
  try {
    const res = await fetch(ENDPOINT, {
      headers: { "X-API-Token": TOKEN, Accept: "application/json" },
    });
    const body = await res.text();
    if (!res.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: `Endpoint ${ENDPOINT} returned HTTP ${res.status}: ${body.slice(0, 300)}` }],
      };
    }
    // Validate it parses, then hand back the raw JSON string.
    JSON.parse(body);
    return { content: [{ type: "text", text: body }] };
  } catch (err) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Failed to reach ${ENDPOINT}: ${err.message}. ` +
          `Is Lando running? For Lando's self-signed cert, set CAB_BOOKING_INSECURE_TLS=1.`,
      }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// Diagnostics must go to stderr — stdout is the JSON-RPC channel.
console.error(`cab-booking MCP server ready → ${ENDPOINT}`);
