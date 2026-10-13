import urllib.request
headers = {'User-Agent': 'Mozilla/5.0'}
url1 = 'https://files.betacorp.vn/media/images/2026/09/15/official-poster-trai-buon-nguoi-final-142318-150926-62.jpg'
url2 = 'https://files.betacorp.vn/media/images/2026/09/03/encor-002a-g-vie-vn-4x5-134909-030926-27.jpg'

for u in [url1, url2]:
    try:
        req = urllib.request.Request(u, headers=headers)
        print(urllib.request.urlopen(req).getcode())
    except Exception as e:
        print(u, e)