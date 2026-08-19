# pi-codex-profiles

A small [pi](https://pi.dev) package for registering multiple ChatGPT Codex OAuth accounts as separate providers.

## Install

```bash
pi install git:github.com/khongtrunght/pi-codex-profiles
```

Then restart pi or run `/reload`.

## Add a profile

Run the interactive command:

```text
/codex-profile
```

Or provide the name and path directly:

```text
/codex-profile codex_work ~/.codex_work
```

The path can be either a Codex directory (the plugin appends `auth.json`) or the auth file itself:

```text
/codex-profile codex_work ~/.codex_work/auth.json
```

Use `/model` to select a model from the new provider. Profiles are stored in:

```text
~/.pi/agent/codex-profiles.json
```

Each profile exposes the configured Codex model catalog under its own provider name. Existing profiles are updated after confirmation.

## Authentication

The referenced `auth.json` must be a Codex OAuth credential file containing `tokens.access_token` and, when refresh is needed, `tokens.refresh_token`. The package refreshes expired access tokens and writes the updated credential file with restrictive permissions.

Do not commit or share your `auth.json` files.

## Development

Try the local package:

```bash
pi -e ./extensions/codex-profiles.ts
```

The package includes the token refresh helper under `scripts/` so it works when installed from git or npm.
