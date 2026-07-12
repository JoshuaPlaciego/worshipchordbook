const str = `<input
  type="checkbox"
  checked={isChecked}
  className="accent-indigo-500 rounded border-white/10"
/>`;
const regex = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
const match = regex.exec(str);
console.log(match[0].endsWith('/>'));
