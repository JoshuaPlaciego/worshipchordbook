import os

filepath = '/src/App.tsx'
if not os.path.exists(filepath):
    filepath = './src/App.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

# Normalize CRLF to LF
c = c.replace('\r\n', '\n')

target_real = "                                    blockDisplayName = `${block.name}${totalTimes > 1 ? ` (${totalTimes}x)` : ''}`;\n                                  }\n                                }}\n                               }"
replace_real = "                                    blockDisplayName = `${block.name}${totalTimes > 1 ? ` (${totalTimes}x)` : ''}`;\n                                  }\n                                }"

if target_real in c:
    c = c.replace(target_real, replace_real)
    print("SUCCESS: Replaced live map brackets!")
else:
    print("WARNING: Direct target match not found, looking for substring...")
    # Find blockDisplayName with different spacing
    sub = "blockDisplayName = `${block.name}${totalTimes > 1 ? ` (${totalTimes}x)` : ''}`;"
    idx = c.find(sub)
    if idx != -1:
        # Let's extract the next 150 chars and replace the malformed braces
        tail = c[idx:idx+250]
        print("Found surrounding text:", repr(tail))
        # We can clean up the curly braces in this local region
        # We want to replace the first occurrence of:
        # }
        # }}
        # }
        # with:
        # }
        # }
        bad_braces = "}\n                               }}\n                               }"
        good_braces = "}\n                               }"
        if bad_braces in tail:
            c = c.replace(bad_braces, good_braces, 1)
            print("SUCCESS: Replaced bad braces using substring tail!")
        else:
            # Let's search with general spaces
            import re
            c, count = re.subn(r'\}\s*\}\}\s*\}', '}\n                               }', c, count=1)
            print(f"Replaced {count} instances using regex!")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)

print("Braces fix script complete.")
