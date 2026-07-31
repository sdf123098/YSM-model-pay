import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve('.');
const output = join(root, 'models_data.js');
const dryRun = process.argv.includes('--dry-run');
const archiveExtensions = new Set(['.zip', '.7z', '.rar']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function filesIn(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesIn(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function findPreview(filePath) {
  let directory = dirname(filePath);
  for (let depth = 0; depth < 3; depth += 1) {
    const images = readdirSync(directory, { withFileTypes: true })
      .filter(entry => {
        if (!entry.isFile()) return false;
        const extension = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
        return imageExtensions.has(extension);
      })
      .map(entry => join(directory, entry.name))
      .sort((left, right) => {
        const leftPriority = left.includes('局内图') ? 0 : 1;
        const rightPriority = right.includes('局内图') ? 0 : 1;
        return leftPriority - rightPriority || left.localeCompare(right, 'zh-Hans-CN');
      });
    if (images.length) return relative(root, images[0]).split('\\').join('/');
    directory = dirname(directory);
  }
  return undefined;
}

const authors = readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
  .map(entry => {
    const authorRoot = join(root, entry.name);
    const ysms = [];
    const zips = [];

    for (const fullPath of filesIn(authorRoot)) {
      const extension = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase();
      if (!['.ysm', ...archiveExtensions].includes(extension)) continue;

      const file = {
        name: fullPath.split(/[\\/]/).pop(),
        path: relative(root, fullPath).split('\\').join('/'),
        sizeMB: Number((statSync(fullPath).size / 1024 / 1024).toFixed(2)),
      };
      const preview = findPreview(fullPath);
      if (preview) file.preview = preview;
      if (extension === '.ysm') ysms.push(file);
      else zips.push(file);
    }

    const sortByPath = (left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN', { sensitivity: 'base' });
    ysms.sort(sortByPath);
    zips.sort(sortByPath);
    return { author: entry.name, ysms, zips };
  })
  .filter(author => author.ysms.length || author.zips.length)
  .sort((left, right) => left.author.localeCompare(right.author, 'zh-Hans-CN', { sensitivity: 'base' }));

const contents = 'window.MODELS_DATA = ' + JSON.stringify(authors) + ';\n';
const previous = readFileSync(output, 'utf8');
if (!dryRun && previous !== contents) writeFileSync(output, contents, 'utf8');

const modelCount = authors.reduce((total, author) => total + author.ysms.length, 0);
const archiveCount = authors.reduce((total, author) => total + author.zips.length, 0);
console.log('Generated ' + modelCount + ' models and ' + archiveCount + ' archives from ' + authors.length + ' authors.');
