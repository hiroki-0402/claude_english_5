import json, sys
d=json.load(open('phrases.json',encoding='utf-8'))
for cat in sys.argv[1:]:
    print('########', cat)
    for p in d:
        if p['catId']==cat:
            print(f"EN : {p['english']}")
            print(f"JA : {p['japanese']}  [{p['register']}/{p['difficulty']}]")
            print(f"FRM: {p['frame']}")
            print(f"NOT: {p['note']}")
            print()
