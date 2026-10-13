import os
import glob
import re

html_files = glob.glob('*.html') + glob.glob('admin/*.html')

# We want to extract the content INSIDE the body tag, minus script tags and header/footers that belong to layouts.
# But since this is a heavy refactoring, let's create a robust parser.

templates = []

for file in html_files:
    if file == 'index.html':
        view_id = 'home'
    else:
        view_id = file.replace('.html', '').replace('admin\\', 'admin-').replace('admin/', 'admin-')
    
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract body content
    body_match = re.search(r'<body[^>]*>(.*?)</body>', content, re.DOTALL | re.IGNORECASE)
    if not body_match:
        continue
    body_content = body_match.group(1)
    
    # Remove script tags that load external files
    body_content = re.sub(r'<script src=".*?"></script>', '', body_content)
    
    # Remove script tags with inline code (we'll move logic to JS files)
    # Wait, some pages like schedule.html have inline scripts! We must keep them or move them manually.
    # It's better if I manually move the inline scripts to their respective .js files first!

print(f"Found {len(html_files)} files.")
