import re
import sys

with open(r'c:\Users\Admin\Downloads\Beta Cinemas (home page).html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

trailers = re.findall(r'data-filmname="([^"]+)"\s+data-trailerurl="([^"]+)"', html)
output = [f'Found {len(trailers)} trailers:']
for name, url in trailers:
    output.append(f' - {name} -> {url}')

sys.stdout.buffer.write(('\n'.join(output) + '\n').encode('utf-8'))
