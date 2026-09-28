/** fnOS-specific integrations for DeepSeek Harness. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { registerAuthorizedDirectoryRoutes } from './host/authorized-directories.ts'
import { injectCachedFnosTheme, type DshThemePreference } from './host/theme-bootstrap.ts'
import { FNOS_GATEWAY_PROXY_PATHS_FIELD, FNOS_SYSTEM_THEME_FIELD, isFnosTheme, type FnosSettings, type FnosTheme } from './contracts/theme-contract.ts'
import { registerGatewayProxyRoutes } from './host/gateway-proxy-routes.ts'
import { registerStaticAssetRoute } from './host/static-assets.ts'
import { registerPresentedPathRoute } from './host/presented-open.ts'

/** Stable Host bundle name. */
export const name = '@tnnevol/dsh-fnos'

/** Settings back the fnOS card and the cached pre-plugin theme bootstrap. */
export const FnosSettingsSchema = z.object({
  [FNOS_SYSTEM_THEME_FIELD]: z.union(['light', 'dark']).volatile(),
  [FNOS_GATEWAY_PROXY_PATHS_FIELD]: z.array(z.string()).volatile(),
})
// 新版 DSH：Loader 从 Config 自动派生插件配置，ns = 插件 id
export const Config = FnosSettingsSchema
// 新版 settings 的 ns 就是插件 id
export const FNOS_AUTHORIZED_DIRECTORIES_SETTINGS_NS = '@tnnevol/dsh-fnos'
const DSH_THEME_SETTINGS_NS = 'ui-theme'

/** Host services required to register the fnOS settings namespace and Web routes. */
export const inject = ['webServer', 'settings']

export function apply(ctx: Context): void {
  registerAuthorizedDirectoryRoutes(ctx)
  registerGatewayProxyRoutes(ctx)
  registerStaticAssetRoute(ctx)
  registerPresentedPathRoute(ctx)
  ctx.inject(['webServer'], httpCtx => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex(html => injectCachedFnosTheme(
        html,
        readDshThemePreference(ctx),
        readCachedFnosTheme(ctx),
      )),
      'dsh-fnos: cached fnOS theme bootstrap',
    )
  })
}
function readDshThemePreference(ctx: Context): DshThemePreference {
  const descriptor = ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === DSH_THEME_SETTINGS_NS)
  const section = descriptor?.value as { preference?: unknown } | undefined
  return section?.preference === 'light' || section?.preference === 'dark' || section?.preference === 'system'
      ? section.preference
      : 'system'
}

function readCachedFnosTheme(ctx: Context): FnosTheme | null {
  const descriptor = ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === FNOS_AUTHORIZED_DIRECTORIES_SETTINGS_NS)
  const section = descriptor?.value as FnosSettings | undefined
  return isFnosTheme(section?.[FNOS_SYSTEM_THEME_FIELD]) ? section[FNOS_SYSTEM_THEME_FIELD] : null
}


export {
  FNOS_AUTHORIZED_DIRECTORIES_DELETE_PATH,
  FNOS_AUTHORIZED_ENTRIES_PATH,
  FNOS_AUTHORIZED_DIRECTORIES_PATH,
  FNOS_AUTHORIZED_DIRECTORIES_SETTINGS_NAMESPACE,
  FNOS_PATH_CONVERSION_PATH,
  FNOS_PATH_OPEN_VALIDATION_PATH,
} from './contracts/authorized-directories-contract.ts'
export { FNOS_SETTINGS_DOCUMENT_PATH } from './contracts/settings-document-contract.ts'
export { FNOS_GATEWAY_PROXY_PATHS_ROUTE, normalizeGatewayProxyPaths, validateGatewayProxyPaths } from './contracts/gateway-proxy-contract.ts'
export {
  accessiblePathsFromEnvironment,
  convertPathsForDisplay,
  dataSharePathsFromEnvironment,
  FNOS_ACCESSIBLE_PATHS_ENV,
  FNOS_DATA_SHARE_PATHS_ENV,
  mergeAuthorizedPaths,
  markAuthorizedPathRemoved,
  normalizeAuthorizedPath,
  normalizeAuthorizedPaths,
  normalizePathForAuthorization,
  isPathWithinAuthorizedDirectory,
  isAuthorizedPathForOpen,
  validatePathForOpen,
  gatewayUserId,
  loadAuthorizedEntries,
  splitPathEnvironment,
} from './host/authorized-directories.ts'
