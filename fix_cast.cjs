const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/\(fetch\(/g, 'fetch(');
// Now, let's fix the promise issue by declaring global fetch to return any!
// But wait, fetch is already declared in lib.dom.d.ts.
// I can just replace `const result = await res.json()` with `const result = await (res as any).json()`!

content = content.replace(/await res\.json\(\)/g, 'await (res as any).json()');
content = content.replace(/await res\.text\(\)/g, 'await (res as any).text()');
content = content.replace(/await resMeta\.json\(\)/g, 'await (resMeta as any).json()');

fs.writeFileSync('src/App.tsx', content);
