import re

with open('css/movie-grid.css', 'r', encoding='utf-8') as f:
    text = f.read()

old_title = '''/* Text & Info */
.mg-title {
    font-family: 'Montserrat', sans-serif;
    font-weight: 800;
    font-size: 18px;
    color: var(--blue);
    margin: 0 0 10px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
}
.mg-meta { font-size: 14px; color: #555; margin-bottom: 5px; line-height: 1.4; }'''

new_title = '''/* Text & Info */
.mg-title {
    font-family: 'Montserrat', sans-serif;
    font-weight: 800;
    font-size: 16px;
    color: var(--blue);
    margin: 0 0 10px 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 42px;
    line-height: 1.3;
    white-space: normal;
}
.mg-meta { 
    font-size: 13px; 
    color: #555; 
    margin-bottom: 5px; 
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}'''

text = text.replace(old_title, new_title)

with open('css/movie-grid.css', 'w', encoding='utf-8') as f:
    f.write(text)