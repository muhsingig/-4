// Usage: node cutout.cjs <input> <output>
const path = require('path');
const fs = require('fs');
const pkg = 'C:/Users/muhsi/Downloads/04 Projects - Web & Code/mdp/node_modules/@imgly/background-removal-node';
const { removeBackground } = require(path.join(pkg, 'dist/index.cjs'));

(async () => {
  const [input, output] = process.argv.slice(2);
  const ext = path.extname(input).toLowerCase();
  const type = ext === '.png' ? 'image/png' : 'image/jpeg';
  const blob = new Blob([fs.readFileSync(input)], { type });
  const out = await removeBackground(blob, { publicPath: 'file:///' + pkg + '/dist/', model: 'medium', output: { format: 'image/png', quality: 1 } });
  fs.writeFileSync(output, Buffer.from(await out.arrayBuffer()));
  console.log('saved', output);
})().catch((e) => { console.error(e); process.exit(1); });
