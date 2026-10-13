with open('schedule.html', 'r', encoding='utf-8') as f:
    text = f.read()

if text.startswith('\ufeff'):
    text = text[1:]

try:
    original = text.encode('cp1252').decode('utf-8')
    print("SUCCESS: " + original[:200])
except Exception as e:
    print("FAILED: " + str(e))