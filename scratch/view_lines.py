import sys
path = sys.argv[1]
start = int(sys.argv[2])
end = int(sys.argv[3])
with open(path, "r", encoding="utf-8") as f:
    for i, line in enumerate(f):
        if start <= i+1 <= end:
            # Safely encode to ASCII for the console output
            safe_line = repr(line).encode('ascii', errors='replace').decode('ascii')
            print(f"{i+1}: {safe_line}")
