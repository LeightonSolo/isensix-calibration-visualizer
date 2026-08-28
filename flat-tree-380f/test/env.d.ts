/** Extends the Cloudflare test pool with this Worker's generated environment bindings. */
declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {}
}
