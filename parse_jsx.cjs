const fs = require('fs');
const content = fs.readFileSync('rest_of_app.txt', 'utf8');

const regex = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
let match;
let stack = [];

while ((match = regex.exec(content)) !== null) {
  const tagStr = match[0];
  const tagName = match[1];
  if (tagStr.endsWith('/>')) {
    continue;
  }
  if (tagStr.startsWith('</')) {
    if (stack.length === 0) {
      console.log('Unmatched closing tag: ' + tagStr + ' at pos ' + match.index);
    } else {
      const top = stack.pop();
      if (top !== tagName) {
        console.log('Mismatched closing tag! Expected ' + top + ' but got ' + tagName + ' at pos ' + match.index);
      }
    }
  } else {
    stack.push(tagName);
  }
}

console.log('Unmatched opening tags remaining: ' + stack.join(', '));
