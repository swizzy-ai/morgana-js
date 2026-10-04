/**
 * `morgana status` — what the worker currently holds for this project.
 *
 * Read-only, and deliberately so: a status command that mutates state is a status
 * command nobody can run twice. Everything here comes from the worker's own
 * `deployments:status` and `deployments:log` routes, so the answer is the
 * worker's, not a local guess from a previous deploy.
 */
import { say, row, bold, green, yellow, dim } from '../ui.mjs'
import { resolveTarget } from './deploy.mjs'
import { readCredentials } from './login.mjs'

async function getJson(base, bearer, route, params) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${base}${route}${qs ? `?${qs}` : ''}`, {
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      accept: 'application/json',
    },
  });
  const text = await res.text();
  let body
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${route} answered with something that is not JSON (${res.status})`);
  }
  if (!res.ok) throw new Error(`${route} → ${res.status} ${body?.message ?? ''}`);
  return body;
}

export async function status({ url, project, env, token } = {}) {
  const { base, projectId, envName } = resolveTarget({ url, project, env })


  // A stored token is the reason `login` exists, so prefer it over nothing and
  // let an explicit --token win over it.
  const stored = readCredentials()[base]?.token;
  const bearer = token || stored || '';

  if (!bearer) {
    say(dim('no credentials — this reads what anyone can see; run `morgana login` for the full view'))
  }

  const data = await getJson(base, bearer, `/api/v1/projects/${encodeURIComponent(projectId)}/deployments:status`, {
    env: envName,
  });

  const info = data?.data ?? data;

  say(`${green('morgana')} ${dim('·')} ${bold(info?.projectId ?? projectId)} ${dim(`(${info?.env ?? envName})`)}`)
  say();

  // `revision` is the worker's own record of what is live. Absent means nothing
  // has ever been deployed for this project+env, which is a real answer rather
  // than a failure.
  if (info?.revision === undefined || info?.revision === null) {
    say(row('deployed', 'never — this project+env has no deployment'));
    return info;
  }

  say(row('revision', String(info.revision)));
  if (info.deployedAt) say(row('deployed at', new Date(info.deployedAt).toISOString()));
  if (info.apps?.length) say(row('apps', info.apps.join(', ')));
  if (info.triggers !== undefined) say(row('triggers', String(info.triggers)));
  if (info.assets !== undefined) say(row('assets', String(info.assets)));

  // The one thing a status command exists to tell you: is the live page still
  // the thing you deployed? Answered by the manifest's entry page, not by a
  // health check, because `verify` already owns "does it work" and this should
  // not quietly become a second, weaker version of it.
  if (info.entry || info.apps?.length) {
    const liveUrl = `${base}/apps/${envName}/${projectId}/main/${info.entry ?? 'home'}`;
    say(row('live', liveUrl));
    say();
    say(dim(`  run ${green('morgana verify')} ${dim(liveUrl)} to drive it in a real browser`));
  }

  if (info.hasWorldManifest === false) {
    say();
    say(yellow('  note: no world manifest recorded — this deployment predates them, or the build sent none'));
  }

  return info;
}
