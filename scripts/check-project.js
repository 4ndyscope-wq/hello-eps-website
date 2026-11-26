'use strict';
const fs = require('fs');
const path = require('path');
const bank = require('../backend/exam-bank.json');
const root = path.join(__dirname, '..', 'public');
const expectedBanks = 17;
const expectedCoursePages = 15;
const slugs = Object.keys(bank);
const questions = Object.values(bank).reduce((sum, list) => sum + list.length, 0);
if (slugs.length !== expectedBanks) throw new Error(`Expected ${expectedBanks} course banks; found ${slugs.length}.`);
if (questions !== 95) throw new Error(`Expected 95 sample questions; found ${questions}.`);
for (const [slug, list] of Object.entries(bank)) {
  if (!Array.isArray(list) || ![5, 10].includes(list.length)) throw new Error(`Invalid question count for ${slug}.`);
  for (const q of list) {
    if (!q.q || !Array.isArray(q.o) || q.o.length !== 4 || !Number.isInteger(q.a) || q.a < 0 || q.a > 3 || !q.e) {
      throw new Error(`Malformed question found in ${slug}.`);
    }
  }
}
const publicFiles = [];
function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, item.name); if (item.isDirectory()) walk(full); else publicFiles.push(full); } }
walk(root);
const htmlFiles = publicFiles.filter(file => file.endsWith('.html'));
const coursePages = htmlFiles.filter(file => file.includes(`${path.sep}courses${path.sep}`) && path.basename(file) !== 'index.html');
if (coursePages.length !== expectedCoursePages) throw new Error(`Expected ${expectedCoursePages} course detail pages; found ${coursePages.length}.`);
for (const file of coursePages) {
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('../mock-test.html?course=')) throw new Error(`Secure mock test link missing in ${path.relative(root, file)}.`);
  if (html.includes('data-mock-test') || html.includes('course-mock-tests.js')) throw new Error(`Public/embedded mock question script still present in ${path.relative(root, file)}.`);
}
if (fs.existsSync(path.join(root, 'assets/js/course-mock-tests.js'))) throw new Error('Old public question bank script still exists.');
const formPages = htmlFiles.filter(file => !['content-admin.html', 'exam-admin.html'].includes(path.basename(file)) && /<form\b/i.test(fs.readFileSync(file, 'utf8')));
for (const file of formPages) {
  const html = fs.readFileSync(file, 'utf8');
  if (!/action="\/api\/inquiries"/i.test(html)) throw new Error(`Form backend action missing from ${path.relative(root, file)}.`);
}
for (const file of ['mock-test.html', 'exam-admin.html']) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}.`);
console.log(`OK: ${slugs.length} protected course exams, ${questions} private sample MCQs, ${coursePages.length} course pages, ${formPages.length} form pages.`);
console.log('OK: old public answer bank removed; secure exam/admin pages exist.');
