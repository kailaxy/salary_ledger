"""Embed deterministic actions for hosted and offline packaged startup."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'Index.html';html=p.read_text();start,end='<!-- ACTIONS:START -->','<!-- ACTIONS:END -->'
block=start+'\n<script>\n'+(root/'web/assistant-actions.js').read_text()+'</script>\n'+end
if start in html:
 a,b=html.index(start),html.index(end)+len(end);html=html[:a]+block+html[b:]
else:
 a=html.index('<!-- PERSONALITY:START -->');html=html[:a]+block+'\n\n'+html[a:]
p.write_text(html)
