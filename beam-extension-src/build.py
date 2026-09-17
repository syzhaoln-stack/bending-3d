"""Rebuild the self-contained teaching page from local editable source files.

The current output HTML provides its bundled MIT Three.js and original scene
engine. Keep the output HTML beside this source directory. No downloads needed.
"""
from pathlib import Path
import re

source=Path(__file__).resolve().parent
target=source.parent/'beam-extension-3d.html'
previous=target.read_text(encoding='utf-8')
blocks=re.findall(r'<script\b[^>]*>([\s\S]*?)</script>',previous)
three=next(b for b in blocks if 'SPDX-License-Identifier: MIT' in b and len(b)>300000)
engine=next(b for b in blocks if 'class BendingScene {' in b)
license_note=re.search(r'<!-- Bundled Three.js license:[\s\S]*?-->',previous).group(0)
html=(source/'page.html').read_text(encoding='utf-8')
parts=[('LICENSE',license_note),('THREE','<script>'+three+'</script>'),('ORIGINAL-SCENE','<script>'+engine+'</script>')]
for marker,filename in [('MECHANICS','mechanics.js'),('VARIABLE-SECTION','variable-section.js'),('SECTION-RESPONSE','section-response.js'),('LESSON-SCENE','lesson-scene.js'),('LESSON-APP','lesson-app.js')]:
    parts.append((marker,'<script>'+(source/filename).read_text(encoding='utf-8')+'</script>'))
for marker,content in parts:
    html=html.replace('<!-- '+marker+' -->',content)
target.write_text(html,encoding='utf-8')
print('Rebuilt offline classroom.')
