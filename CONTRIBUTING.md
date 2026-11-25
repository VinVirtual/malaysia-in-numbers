# Contributing

Thanks for helping. Keep changes small and focused.

1. Fork, then branch from `main`.
2. `npm ci` and `./check_env.sh`.
3. Make the change. Datasets, request limits and the site address live in `scripts/lib/config.mjs`; how each topic page shows its data lives in `scripts/lib/topics.mjs`.
4. Run `npm test` (no network) and `./mnum check`. If you touched pages, styles or charts, also run `./mnum site && npm run test:e2e` (needs Chrome; set `MNUM_CHROME` if it is not found).
5. Open a pull request saying what changed and why. CI runs the same tests.

Adding a dataset: check its id, publisher and cadence against the API's `meta` block, record a fixture in `tests/fixtures/`, and keep a run under the API's 4 requests a minute.

House rules:

- No third-party requests from the built site, no inline scripts or styles (the build checks).
- Keep the data.gov.my and OpenDOSM attribution and the CC BY 4.0 notice on every page.
- Figures are shown as published: no smoothing, filling or adjustment.
- Copy is short and plain, in English with Malay labels. No em dashes.
- Commit messages: `type: description` (feat, fix, docs, test, refactor, chore).

Found a security problem? Please open an issue without the details and ask for a private channel, or use GitHub's private vulnerability reporting if it is enabled.
