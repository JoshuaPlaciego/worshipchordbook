const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Fix the bad replacements
content = content.replace(/await res as any\)\.json\(\)/g, '(await (res as any).json())');
content = content.replace(/await res as any\)\.text\(\)/g, '(await (res as any).text())');
content = content.replace(/await resMeta as any\)\.json\(\)/g, '(await (resMeta as any).json())');
content = content.replace(/await res as any\)\.json\(\)/g, '(await (res as any).json())'); // just in case

// Oh wait, the current text is `await res as any).json()`
content = content.replace(/await res as any\)\.json\(\)/g, '(await (res as any).json())');

// Wait, let's just do regex on `as any).json()`
content = content.replace(/await res(.*?) as any\)\.json\(\)/g, 'await (res$1 as any).json()');
content = content.replace(/await res(.*?) as any\)\.text\(\)/g, 'await (res$1 as any).text()');

fs.writeFileSync('src/App.tsx', content);
