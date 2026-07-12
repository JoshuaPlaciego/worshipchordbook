with open('./src/components/MusicianModal.tsx', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f, 1):
        if 'className=' in line and ('bg-' in line or 'backdrop-' in line or 'border-' in line or 'from-' in line):
            if 'fixed' in line or 'max-w-' in line or 'shadow-' in line:
                print(f"L{i}: {line.strip()[:140]}")
