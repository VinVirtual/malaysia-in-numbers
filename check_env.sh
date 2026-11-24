#!/usr/bin/env bash
# malaysia-in-numbers: is this machine ready? Says how to fix anything missing.
set -uo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ok=0
pass() { printf '  ok      %s\n' "$1"; }
fail() { printf '  MISSING %s\n          fix: %s\n' "$1" "$2"; ok=1; }
note() { printf '  note    %s\n          %s\n' "$1" "$2"; }

echo "fetch, site and unit tests:"
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; then pass "node $(node -v)"; else fail "Node 22 or newer" "install Node 22+ (for example: nvm install 22)"; fi
if (cd "$R" && node scripts/mnum.mjs check >/dev/null 2>&1); then pass "committed data is valid"; else fail "committed data" "run: node scripts/mnum.mjs check   (it names the broken file)"; fi

echo "browser test and screenshots (optional):"
if [ -d "$R/node_modules/playwright-core" ]; then pass "playwright-core"; else note "playwright-core not installed" "cd $R && npm ci"; fi
chrome=""
for c in "${MNUM_CHROME:-}" /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium /usr/bin/chromium-browser; do [ -n "$c" ] && [ -x "$c" ] && chrome="$c" && break; done
if [ -n "$chrome" ]; then pass "Chrome: $chrome"; else note "no Chrome found" "install Google Chrome, or set MNUM_CHROME to a Chromium binary"; fi

echo "deploying by hand (optional):"
if command -v npx >/dev/null; then pass "npx (for: npx wrangler pages deploy dist --project-name malaysia-in-numbers)"; else note "npx not found" "comes with Node; needed only to deploy from this machine"; fi

[ $ok -eq 0 ] && echo "ready." || echo "fix the MISSING lines above."
exit $ok
