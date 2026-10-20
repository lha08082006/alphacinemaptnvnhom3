import os
import glob
import re

target_files = ['index.html'] + glob.glob('js/*.js') + glob.glob('css/*.css')

local_refs = []
online_refs = []

# Match image extensions
img_pattern = re.compile(r'[\'\"\(=]([^\'\"\)\s>]+\.(?:png|jpg|jpeg|svg|webp|gif))', re.IGNORECASE)

for fpath in target_files:
    if not os.path.exists(fpath):
        continue
    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    matches = img_pattern.findall(content)
    for m in matches:
        m = m.strip('\'\"=() ')
        if m.startswith('http://') or m.startswith('https://'):
            online_refs.append((fpath, m))
        else:
            local_refs.append((fpath, m))

print(f'=== LOCAL IMAGES FOUND ({len(local_refs)} occurrences) ===')
unique_local = sorted(list(set(r[1] for r in local_refs)))
for u in unique_local:
    files = sorted(list(set(r[0] for r in local_refs if r[1] == u)))
    print(f'LOCAL: {u} -> referenced in: {files}')

print(f'\n=== ONLINE CDN/WEB IMAGES FOUND ({len(online_refs)} occurrences) ===')
unique_online = sorted(list(set(r[1] for r in online_refs)))
for u in unique_online:
    print(f'ONLINE: {u}')
