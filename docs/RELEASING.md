# Versioning & Releasing

## Where the version lives

FinKoll keeps a single version number in **both** `package.json` files:

- `backend/package.json` → shown in the API startup log
- `frontend/package.json` → compiled into the UI as `__APP_VERSION__` and shown
  in the sidebar footer (`v1.0.0`)

Both are currently **`1.0.0`**, so the code already declares Release 1.0 — no bump
is required to ship it. Keep the two files in sync on every release.

## Do you *need* to tag/release?

Tagging is **optional but recommended**. Nothing breaks without it. What a tag +
GitHub Release gives you:

- A permanent, downloadable snapshot users can pin to (`git checkout v1.0.0`).
- Human-readable release notes on the repo's Releases page.
- A stable reference for the [CHANGELOG](../CHANGELOG.md) links.

For a public repo people may self-host, that stability is worth the 30 seconds.

## Marking Release 1.0.0 (one-time, run yourself)

The code is already at `1.0.0`, so this is just tagging what's committed:

```bash
cd /path/to/FinKoll
# make sure main is committed & pushed first
git tag -a v1.0.0 -m "FinKoll 1.0.0 — first public release"
git push origin v1.0.0
```

Then on GitHub → **Releases → Draft a new release** → choose tag `v1.0.0`, title
"FinKoll 1.0.0", and paste the 1.0.0 section from the [CHANGELOG](../CHANGELOG.md).
(Or with the CLI: `gh release create v1.0.0 --title "FinKoll 1.0.0" --notes-file <(sed -n '/## \[1.0.0\]/,/## \[/p' CHANGELOG.md)`.)

## Cutting future releases

FinKoll follows [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`:

- **PATCH** (`1.0.1`) — bug fixes, no behavior change.
- **MINOR** (`1.1.0`) — new features, backwards-compatible (most FinKoll releases).
- **MAJOR** (`2.0.0`) — breaking changes (e.g. a data-model change requiring
  manual migration, or dropped config).

Release steps:

1. Move the `Unreleased` notes in `CHANGELOG.md` under a new `## [x.y.z] — DATE`.
2. Bump the version in **both** `package.json` files (keep them equal).
3. Commit: `chore(release): vX.Y.Z`.
4. Tag and push: `git tag -a vX.Y.Z -m "…" && git push origin vX.Y.Z`.
5. Publish the GitHub Release from the tag.

> **Database migrations:** any release that changes the schema ships a migration
> that runs automatically on startup after a pre-migration backup. Call out such
> releases clearly in the changelog and point users at [UPDATING](../UPDATING.md).
