#!/usr/bin/env python3
"""Assemble artifact/index.html from the shared stylesheet, the shared task
pool and the single-phone app. Run after editing any of the three."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
css = (root / 'docs/styles.css').read_text()
tasks = (root / 'docs/tasks.js').read_text()
version = (root / 'docs/version.js').read_text()
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
print('artifact/index.html', len(page), 'bytes')
