import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import { FNOS_GATEWAY_PROXY_PATHS_FILE, FNOS_GATEWAY_PROXY_PATHS_ROUTE, normalizeGatewayProxyPaths, validateGatewayProxyPaths, type GatewayProxyPathsDocument } from '../contracts/gateway-proxy-contract.ts'
import type { FnosSettings } from '../contracts/theme-contract.ts'

function send(res: ServerResponse, status: number, value: unknown): void { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)) }
async function body(req: IncomingMessage): Promise<unknown> { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return undefined } }
function trusted(req: IncomingMessage): boolean { const origin = req.headers.origin; if (origin === undefined) return true; const host = req.headers['x-forwarded-host'] ?? req.headers.host; try { return new URL(origin).host === host } catch { return false } }

export function gatewayProxyPathsFile(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const root = env.TRIM_PKGVAR?.trim()
  return root ? join(root, FNOS_GATEWAY_PROXY_PATHS_FILE) : undefined
}

async function readDocument(file: string): Promise<GatewayProxyPathsDocument> {
  try { const value: unknown = JSON.parse(await readFile(file, 'utf8')); return { version: 1, paths: normalizeGatewayProxyPaths(value) ?? [] } }
  catch { return { version: 1, paths: [] } }
}

async function writeDocument(file: string, document: GatewayProxyPathsDocument): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, file)
}

/** 新版 settings 的 ns 是插件 id，不是旧常量。 */
const PLUGIN_SETTINGS_NS = '@tnnevol/dsh-fnos'

/** 读当前 fnOS 插件配置（新版 settings API）。 */
function readFnosSettings(ctx: Context): FnosSettings | undefined {
  const descriptor = ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === PLUGIN_SETTINGS_NS)
  return descriptor?.value as FnosSettings | undefined
}

export function registerGatewayProxyRoutes(ctx: Context): void {
  const file = gatewayProxyPathsFile()
  if (file !== undefined) {
    const sync = (value: FnosSettings | undefined): Promise<void> =>
        writeDocument(file, { version: 1, paths: normalizeGatewayProxyPaths(value?.gatewayProxyPaths ?? []) ?? [] })

    ctx.effect(() => {
      void sync(readFnosSettings(ctx)).catch(error => {
        console.error('[dsh-fnos] unable to initialize gateway proxy paths', error)
      })
      const handler = (ns: string): void => {
        if (ns !== PLUGIN_SETTINGS_NS) return
        void sync(readFnosSettings(ctx)).catch(error => {
          console.error('[dsh-fnos] unable to sync gateway proxy paths', error)
        })
      }
      return ctx.on('settings/document-updated', handler)
    }, 'dsh-fnos: gateway proxy path settings mirror')
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: FNOS_GATEWAY_PROXY_PATHS_ROUTE,
    handler: async (req, res) => {
      if (!trusted(req)) return send(res, 403, { error: 'remote-web-origin-not-trusted' })
      const file = gatewayProxyPathsFile()
      if (file === undefined) return send(res, 503, { error: 'fnos-gateway-config-unavailable' })
      if (req.method === 'GET') return send(res, 200, { version: 1, paths: normalizeGatewayProxyPaths(readFnosSettings(ctx)?.gatewayProxyPaths ?? []) ?? [] })
      if (req.method !== 'PUT') return send(res, 405, { error: 'method-not-allowed' })
      const paths = validateGatewayProxyPaths(await body(req))
      if (paths === undefined) return send(res, 400, { error: 'invalid-gateway-proxy-paths' })
      const document: GatewayProxyPathsDocument = { version: 1, paths }
      const previous = await readDocument(file)
      await writeDocument(file, document)
      try { await ctx.settings.update(PLUGIN_SETTINGS_NS, { gatewayProxyPaths: paths }) }
      catch (error) { await writeDocument(file, previous); throw error }
      send(res, 200, document)
    },
  }), 'dsh-fnos: gateway API proxy paths')
}