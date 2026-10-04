# @morgana/agents

The agent loop for Morgana — providers, action tools, and `ctx.agents`.

```bash
npm i @morgana/agents
```

## An agent is a name and an instruction

```ts
import { providerFromEnv, resolveTransport, buildAgentSurface } from '@morgana/agents'
```

Three pieces:

- A **provider** is where a completion goes. One transport, so a project can use
  the Morgana route with no credentials and swap in its own key without the loop
  noticing.
- **Tools** are actions. `ctx.ai.tools.register('closeTask', { describe })` says
  what the model is told about a tool; the body is the server action of that
  name, reached through the same runner `ctx.actions.run` uses. So a tool can
  read collections and files, and inherits the calling action's session, because
  it *is* an action.
- An **agent** is an instruction plus the tasks it is given. `create` writes the
  declaration down; `run` is the expensive part.

## Missing configuration is an error, not a fallback

```ts
providerFromEnv({ provider: 'openai' })  // throws: names the missing field
```

Every provider that needs a credential refuses to be constructed without one.
There is no default key and no ambient environment read from inside the loop — a
provider that silently falls back to somebody else's endpoint is worse than one
that refuses.

| variable | |
|---|---|
| `MORGANA_URL` | the Morgana route |
| `MORGANA_TOKEN` | credential for it |
| `MORGANA_LLM_PROVIDER` | `morgana` (default), `openai`, `anthropic` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | for those providers |
| `MORGANA_LLM_KEY` | stands in for any provider key |

## What survives a turn

History is replayed in the roles it was written in. Sending an assistant turn
through `SystemMessage` would relabel the model's own past answers as
instructions, and the conversation would become one undifferentiated block of
directives.

`tool` messages are skipped rather than guessed at. A tool result is only
meaningful next to the call it answers — it carries a `tool_call_id`, and every
provider rejects a tool message without one.

## Licence

Apache-2.0