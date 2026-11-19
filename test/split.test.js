import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPassage, countWords } from '../public/js/split.js';

test('abbreviations, initials and quotes do not break sentences', () => {
  const s = splitPassage('Dr. Smith said, "Why do we sleep?" J. K. Rowling wrote books, e.g. novels. In 2020, the U.S. economy shrank. However, it recovered!');
  assert.deepEqual(s.map((x) => x.text), [
    'Dr. Smith said, "Why do we sleep?"',
    'J. K. Rowling wrote books, e.g. novels.',
    'In 2020, the U.S. economy shrank.',
    'However, it recovered!',
  ]);
});

test('blank lines separate paragraphs; wrapped lines are joined', () => {
  const s = splitPassage('First line\ncontinues here. Second one.\n\nNew paragraph starts. Ends.');
  assert.deepEqual(s.map((x) => [x.text, x.paragraph]), [
    ['First line continues here.', 1], ['Second one.', 1], ['New paragraph starts.', 2], ['Ends.', 2],
  ]);
});

test('lowercase after question mark stays in sentence', () => {
  const s = splitPassage('"Why?" she asked. Nobody answered.');
  assert.equal(s.length, 2);
});

test('countWords', () => {
  assert.equal(countWords("It's a well-known fact."), 4);
});
