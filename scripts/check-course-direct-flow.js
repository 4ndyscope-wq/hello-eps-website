'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const pages = fs.readdirSync(path.join(root, 'courses')).filter(f => f.endsWith('.html') && f !== 'index.html');
if (pages.length !== 15) throw new Error(`Expected 15 course pages; found ${pages.length}`);
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, 'courses', file), 'utf8');
  if (!html.includes('class="btn mock-hero-btn"') || !html.includes('Take Mock Test</a>')) {
    throw new Error(`Public course entry button missing in ${file}`);
  }
  if (!html.includes('../mock-test.html?course=')) throw new Error(`Direct exam URL missing in ${file}`);
  if (/mock-test-section[^>]*\bhidden\b/.test(html)) throw new Error(`Mock test section should be visible in ${file}`);
}
const catalogue = fs.readFileSync(path.join(root, 'courses.html'), 'utf8');
if ((catalogue.match(/<span> &amp; Mock Test<\/span>/g) || []).length !== 15) {
  throw new Error('Course catalogue must show the Mock Test label for all 15 courses.');
}
let htmlCount = 0;
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.name.endsWith('.html')) {
      htmlCount++;
      const html = fs.readFileSync(full, 'utf8');
      if (html.includes('>Student Login</a>')) throw new Error(`Public Student Login label remains in ${path.relative(root, full)}`);
      if (html.includes('data-student-portal-link') && !/data-student-portal-link[^>]*hidden|hidden[^>]*data-student-portal-link/.test(html)) {
        throw new Error(`Portal navigation should start hidden in ${path.relative(root, full)}`);
      }
    }
  }
}
walk(root);
console.log(`OK: 15 course pages expose direct, course-specific Mock Test URLs.`);
console.log(`OK: ${htmlCount} HTML pages have no public Student Login label; session-controlled navigation remains.`);
