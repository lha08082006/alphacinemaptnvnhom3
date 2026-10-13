import urllib.request
try:
    print(urllib.request.urlopen('https://files.betacorp.vn/media/images/2026/09/15/official-poster-trai-buon-nguoi-final-142318-150926-62.jpg').getcode())
except Exception as e:
    print(e)