import { Hono } from 'hono';

/**
 * RFC 9728 protected-resource metadata: where MCP clients find the
 * authorization server for `/mcp` (KTD3). Served at the path-suffixed URL the
 * 401 challenge names and at the bare one older clients try first.
 */
export function protectedResourceMetadata({
  resource,
  authorizationServer,
}: {
  resource: string;
  authorizationServer: string;
}) {
  const metadata = {
    resource,
    authorization_servers: [authorizationServer],
    bearer_methods_supported: ['header'],
  };
  return new Hono()
    .get('/oauth-protected-resource/mcp', (c) => c.json(metadata))
    .get('/oauth-protected-resource', (c) => c.json(metadata));
}
