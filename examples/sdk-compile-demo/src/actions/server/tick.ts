export async function handle(ctx: any) {
  ctx.log('tick', new Date().toISOString())
  return { ok: true }
}
