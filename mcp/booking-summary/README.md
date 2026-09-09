# cab-booking MCP server

A tiny local [MCP](https://modelcontextprotocol.io) server that exposes the
Drupal `GET /api/bookings/summary` endpoint as a single tool,
`get_booking_summary`, so the Cowork **booking dashboard** artifact can pull
live data. It runs on your machine, so it can reach the site on localhost/Lando.

```
Cowork artifact ──callMcpTool──▶ this server ──fetch(+token)──▶ /api/bookings/summary ──▶ Drupal
```

## 1. Install

```bash
cd mcp/booking-summary
npm install
```

Requires Node 18+ (uses the built-in `fetch`).

## 2. Configure it in Cowork / Claude Desktop

Add this to your MCP servers config (Settings → Connectors → “Add local/custom
server”, or your `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cab-booking": {
      "command": "node",
      "args": ["/Users/shivanand/projects/lando/cab-booking/mcp/booking-summary/index.js"],
      "env": {
        "CAB_BOOKING_URL": "https://cab-booking.lndo.site",
        "CAB_BOOKING_API_TOKEN": "the-same-token-you-put-in-settings.php",
        "CAB_BOOKING_INSECURE_TLS": "1"
      }
    }
  }
}
```

Notes:

- `CAB_BOOKING_URL` — your site's base URL (check `lando info` if it differs).
- `CAB_BOOKING_API_TOKEN` — must match `$settings['cab_booking_api_token']` in
  `web/sites/default/settings.php`.
- `CAB_BOOKING_INSECURE_TLS=1` — accepts Lando's self-signed local certificate.
  Dev only; drop it once you're on a real cert / HTTP.

Because the server key is `cab-booking`, Cowork exposes the tool to artifacts as
**`mcp__cab-booking__get_booking_summary`** — which is exactly what the
dashboard calls.

## 3. Try it

Restart Cowork so it picks up the server, then open the **booking-dashboard**
artifact. It will call the tool on load; if it succeeds you'll see a
**LIVE DATA** badge, otherwise it falls back to simulated figures.

## Test locally (optional)

```bash
CAB_BOOKING_URL=https://cab-booking.lndo.site \
CAB_BOOKING_API_TOKEN=your-token \
CAB_BOOKING_INSECURE_TLS=1 \
node index.js
```

It speaks JSON-RPC over stdio (no HTTP port). Diagnostics print to stderr.
