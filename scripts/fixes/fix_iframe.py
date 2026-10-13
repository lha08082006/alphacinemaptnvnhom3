import re

with open('js/trailer.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_iframe = r'<iframe src="https://www.youtube-nocookie.com/embed/\$\{ytId\}\?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen onerror="handleYtError\(\'\$\{ytId\}\'\)"></iframe>'
new_iframe = r'<iframe width="100%" height="100%" src="https://www.youtube.com/embed/?autoplay=1&rel=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'

text = re.sub(old_iframe, new_iframe, text)

with open('js/trailer.js', 'w', encoding='utf-8') as f:
    f.write(text)