/**
 * Backend stats for the home page — fetched on page load by the
 * `loadStats` browser action (`on: 'loaded'`) via ctx.actions.run.
 */
export async function handle(ctx: any) {
  void ctx
  return { visitors: 1284, signups: 56, uptime: '99.99%' }
}
