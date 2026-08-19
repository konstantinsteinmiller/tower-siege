/**
 * Extensionless-import resolver for running game modules under plain Node.
 *
 * The game is bundled by Vite, so its relative imports omit the extension
 * (`./enemies`, not `./enemies.ts`). Node's ESM resolver requires it. This hook
 * retries a failed relative resolution with `.ts` appended, which is enough to
 * run `src/game/*` — pure logic modules with no Vue and no alias imports —
 * directly from a script.
 *
 * Used by `tools/balance-replay.ts`. Not part of the app build.
 */
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
        return next(`${specifier}.ts`, context)
      }
      throw err
    }
  }
})
