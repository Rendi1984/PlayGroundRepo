#!/usr/bin/env python3
"""Build step. Run after every change to docs/version.js or the app files.

1. Stamps APP_VERSION onto the asset URLs in docs/index.html, so a phone that
   already has the old app.js gets the new one instead of a cached copy.
2. Assembles artifact/index.html (the single-phone build) from the shared
   stylesheet, version, task pool, sound module and solo app.
"""
from pathlib import Path

import re

root = Path(__file__).resolve().parent.parent
version_src = (root / 'docs/version.js').read_text()
APP_VERSION = re.search(r"APP_VERSION\s*=\s*'([^']+)'", version_src).group(1)

# 1. cache-bust the two-phone build's assets
index = root / 'docs/index.html'
html_in = index.read_text()
stamped = re.sub(r'(href="styles\.css|src="(?:version|gate|tasks|sound|app)\.js)(\?v=[^"]*)?"',
                 lambda m: f'{m.group(1)}?v={APP_VERSION}"', html_in)
if stamped != html_in:
    index.write_text(stamped)
print(f'docs/index.html stamped v{APP_VERSION}')

css = (root / 'docs/styles.css').read_text()
tasks = (root / 'docs/tasks.js').read_text()
version = (root / 'docs/version.js').read_text()
gate = (root / 'docs/gate.js').read_text()
sound = (root / 'docs/sound.js').read_text()
solo = (root / 'artifact/solo.js').read_text()

page = f"""<title>גלגל הזוגות</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Suez+One&family=Assistant:wght@400;600;700&display=swap">
<style>
{css}</style>

<div class="wrap" id="app"></div>

<script>
{version}
</script>
<script>
{gate}
</script>
<script>
{tasks}
</script>
<script>
{sound}
</script>
<script>
{solo}
</script>
"""
(root / 'artifact/index.html').write_text(page)
print(f'artifact/index.html rebuilt at v{APP_VERSION} ({len(page)} bytes)')
