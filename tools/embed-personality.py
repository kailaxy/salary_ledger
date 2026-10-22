"""Keep personality styling inline for hosted and packaged offline startup."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
page = root / 'Index.html'
html = page.read_text()
start, end = '<!-- PERSONALITY:START -->', '<!-- PERSONALITY:END -->'
block = start + '\n<script>\n' + (root / 'web/assistant-personality.js').read_text() + '</script>\n' + end
if start in html:
    a, b = html.index(start), html.index(end) + len(end)
    html = html[:a] + block + html[b:]
else:
    a = html.index('<!-- OPERATIONS:START -->')
    html = html[:a] + block + '\n\n' + html[a:]
page.write_text(html)
