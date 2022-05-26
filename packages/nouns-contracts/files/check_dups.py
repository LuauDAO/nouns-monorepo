import json

addrs = json.load(open("recipients.json","r"))

print(f'{len(addrs)} addresses in file: {len(addrs) - len(set([a.lower() for a in addrs]))} duplicates')