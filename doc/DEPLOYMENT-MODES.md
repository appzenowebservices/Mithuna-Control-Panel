# Deployment and Authentication

Status: Canonical deployment and auth model
Date: 2026-02-23

## 1. Purpose

Paperclip requires human authentication in every deployment. Exposure is a
separate policy:

1. `private`
2. `public`

Private/public exposure controls network reachability, not whether users sign in.

Paperclip now treats **bind** as a separate concern from auth:

- auth model: `authenticated`, plus `private/public` exposure
- reachability model: `server.bind = loopback | lan | tailnet | custom`

## 2. Canonical Model

| Exposure | Human auth | Primary use |
|---|---|---|
| `private` | Login required | Local, LAN, VPN, or tailnet deployment |
| `public` | Login required | Internet-facing/cloud deployment |

## Reachability Model

| Bind | Meaning | Typical use |
|---|---|---|
| `loopback` | Listen on localhost only | default local usage, reverse-proxy deployments |
| `lan` | Listen on all interfaces (`0.0.0.0`) | LAN/VPN/private-network access |
| `tailnet` | Listen on a detected Tailscale IP | Tailscale-only access |
| `custom` | Listen on an explicit host/IP | advanced interface-specific setups |

## 3. Security Policy

## `authenticated + private`

- login required
- low-friction URL handling (`auto` base URL mode)
- private-host trust policy required
- bind can be `loopback`, `lan`, `tailnet`, or `custom`

## `authenticated + public`

- login required
- explicit public URL required
- stricter deployment checks and failures in doctor
- recommended bind is `loopback` behind a reverse proxy; direct `lan/custom` is advanced

## 4. Onboarding UX Contract

Default onboarding remains interactive and flagless:

```sh
pnpm paperclipai onboard
```

Server prompt behavior:

1. quickstart `--yes` defaults to `server.bind=loopback` and `authenticated/private`
2. advanced server setup asks reachability first:
- `Local computer` → `bind=loopback`, `authenticated/private`
- `Private network` → `bind=lan`, `authenticated/private`
- `Tailnet` → `bind=tailnet`, `authenticated/private`
- `Custom` → manual exposure/host entry
3. raw host entry is only required for the `Custom` path
4. explicit public URL is only required for `authenticated + public`

Examples:

```sh
pnpm paperclipai onboard --yes
pnpm paperclipai onboard --yes --bind lan
pnpm paperclipai run --bind tailnet
```

`configure --section server` follows the same interactive behavior.

## 5. Doctor UX Contract

Default doctor remains flagless:

```sh
pnpm paperclipai doctor
```

Doctor reads configured mode/exposure and applies mode-aware checks. Optional override flags are secondary.

## 6. Board/User Integration Contract

Board identity must be represented by a real DB user principal for user-based features to work consistently.

Required integration points:

- real user row in `authUsers` for Board identity
- `instance_user_roles` entry for Board admin authority
- `company_memberships` integration for user-level task assignment and access

This is required because user assignment paths validate active membership for `assigneeUserId`.

## 7. Legacy Local Board Claim Flow

Existing databases created before authentication was mandatory may have only
the `local-board` instance admin. When no real instance admin exists, Paperclip
emits a startup warning with a one-time high-entropy claim URL.

- URL format: `/board-claim/<token>?code=<code>`
- intended use: signed-in human claims board ownership
- claim action:
  - promotes current signed-in user to `instance_admin`
  - demotes `local-board` admin role
  - ensures active owner membership for the claiming user across existing companies

This lets the first signed-in user claim an existing instance without losing its companies or data.

## 8. First Admin Setup For Fresh Authenticated Installs

Fresh authenticated installs start in `bootstrap_pending` until the first
`instance_admin` exists.

For `authenticated/private`, Paperclip supports a browser-first setup path:

1. open the Paperclip URL from the private network or appliance UI
2. sign in or create a Paperclip account
3. choose `Claim this instance` on the setup screen

That browser claim promotes the signed-in session user to the first instance
admin and then falls through to normal onboarding. The endpoint is available
only to real browser session actors in `authenticated/private`; unauthenticated
requests, agent keys, board API keys, and local implicit board actors are
rejected.

The CLI fallback remains supported in all authenticated setup states:

```sh
pnpm paperclipai auth bootstrap-ceo
```

That command prints a one-time first-admin invite URL. Browser claim and
bootstrap invite acceptance share the same first-admin transaction, so whichever
path wins first makes later attempts return a conflict.

For `authenticated/public`, browser first-admin claim is intentionally disabled.
Public deployments must use the high-entropy bootstrap invite path unless a
future public-hosted setup design explicitly changes this policy.

## 9. Current Code Reality

- all browser access uses Better Auth sessions and the bootstrap invite flow
- old config files may still contain `local_trusted`; runtime upgrades them to authenticated behavior
- company creation ensures creator membership in `company_memberships` so user assignment/access flows remain consistent

## 10. Naming and Compatibility Policy

- canonical deployment naming is `authenticated` with `private/public` exposure
- legacy `local_trusted` config values are accepted for reading but cannot disable authentication

## 11. Relationship to Other Docs

- implementation plan: `doc/plans/deployment-auth-mode-consolidation.md`
- V1 contract: `doc/SPEC-implementation.md`
- operator workflows: `doc/DEVELOPING.md` and `doc/CLI.md`
- invite/join state map: `doc/spec/invite-flow.md`
