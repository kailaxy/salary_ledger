"""Keep the hosted and packaged planner identical to Apps Script's pure module."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
page = root / 'Index.html'
source = (root / 'Operations.gs').read_text()
start, end = '<!-- OPERATIONS:START -->', '<!-- OPERATIONS:END -->'
html = page.read_text()
block = start + '\n<script>\n' + source + '</script>\n' + end
if start in html:
    a, b = html.index(start), html.index(end) + len(end)
    html = html[:a] + block + html[b:]
else:
    index = html.index('<script>\n/* Local single-record mutations')
    html = html[:index] + block + '\n\n' + html[index:]
page.write_text(html)
