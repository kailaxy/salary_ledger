"""Embed the standalone read-only query engine in both app delivery paths."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
page = root / 'Index.html'
html = page.read_text()
start, end = '<!-- QUERY:START -->', '<!-- QUERY:END -->'
if start in html:
    a, b = html.index(start), html.index(end) + len(end)
else:
    a = html.index('<script>\n/* Deterministic cached-ledger query engine')
    b = html.index('</script>', a) + len('</script>')
page.write_text(html[:a] + start + '\n<script>\n' + (root / 'web/ledger-query.js').read_text() + '</script>\n' + end + html[b:])
