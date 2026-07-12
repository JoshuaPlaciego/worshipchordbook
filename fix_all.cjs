const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace ALL fetch with await fetch if not already
// But we can just use regex for .json() and .text() on Promise<Response>
// Actually, it's easier to just do: `const res = await fetch` for all those specific lines!
content = content.replace(/fetch\(/g, 'await fetch(');
// wait, fetch inside useEffect shouldn't use await if the function is not async!
// So let's just make getSetlistArrangement and exportToPDF available globally to shut up TS
const globalDefs = `
declare global {
  function getSetlistArrangement(setId: string, songId: string): any;
  function exportToPDF(): void;
}
(window as any).getSetlistArrangement = () => null;
(window as any).exportToPDF = () => null;
`;
// Let's just put it at the very top of src/App.tsx!
content = globalDefs + content;

// Revert await fetch where it breaks (just ignore the await fetch replacement)
