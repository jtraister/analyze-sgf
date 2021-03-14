/**
 * @fileOverview Helper functions to parse SGF format.
 */

const sgfparser = require('@sabaki/sgf');

// 'I' => 'J'
// 'J' => 'K'
const nextChar = (c) => String.fromCharCode(c.charCodeAt(0) + 1);

// 'J' => 'I'
// 'K' => 'J'
const prevChar = (c) => String.fromCharCode(c.charCodeAt(0) - 1);

// 'aa' => 'A1'
// 'ia' => 'J1'
function iaToJ1(value) {
  const v = value.toUpperCase();
  return v[0] >= 'I'
    ? nextChar(v[0]) + (v.charCodeAt(1) - 64).toString()
    : v[0] + (v.charCodeAt(1) - 64).toString();
}

// Real Goban display.
// 'aa' => 'A19'
// 'bd' => 'B16'
function iaToJ19(value) {
  const v = value.toUpperCase();
  return v[0] >= 'I'
    ? nextChar(v[0]) + (84 - v.charCodeAt(1)).toString()
    : v[0] + (84 - v.charCodeAt(1)).toString();
}

// 'A1' => 'aa'
const iaFromJ1 = (v) =>
  v[0] >= 'J'
    ? prevChar(v[0].toLowerCase()) +
      String.fromCharCode(parseInt(v.substring(1, v.length), 10) + 96)
    : v[0].toLowerCase() +
      String.fromCharCode(parseInt(v.substring(1, v.length), 10) + 96);

const indexOfRegex = (string, regex, start) => {
  const index = string.substring(start || 0).search(regex);
  return index >= 0 ? index + (start || 0) : index;
};

// ('(;W[aa];B[bb];W[cc])', 'XX', 0) => '(;W[aa]XX;B[bb];W[cc])'
// ('(;W[aa];B[bb];W[cc])', 'XX', 7) => '(;W[aa];B[bb]XX;W[cc])'
function addProperty(seq, mark, index) {
  const start = indexOfRegex(seq, /[^\\]\]/, Math.max(0, index - 1));

  return start !== -1
    ? seq.substring(0, start + 2) + mark + seq.substring(start + 2)
    : '';
}

// ('(;W[aa];B[bb];W[cc])', 0) => '(;W[aa]TE[1];B[bb];W[cc])'
const toGoodNode = (seq, index = 0) => addProperty(seq, 'TE[1]', index);

// ('(;W[aa];B[bb];W[cc])', 0) => '(;W[aa]BM[1];B[bb];W[cc])'
const toBadNode = (seq, index = 0) => addProperty(seq, 'BM[1]', index);

// ('(;W[aa];B[bb];W[cc])', 0) => '(;W[aa]BM[1]HO[1];B[bb];W[cc])'
const toBadHotSpot = (seq, index = 0) =>
  addProperty(seq, 'BM[1]HO[1]', index);

// ('(;W[aa];B[bb])', 'hey[]', 0) => '(;W[aa]C[hey[\]];B[bb])'
const addComment = (seq, comment, index = 0) =>
  addProperty(seq, `C[${comment.replace(/\]/g, '\\]')}]`, index);

// For SABAKI autoplaying PVs.
// '(;W[po];B[hm];W[ae]...)' => 'WQ5 H7 A15'
// ';W[po]' => 'Q5'
function seqToPV(seq) {
  const pl = seq[0] === '(' ? seq[2] : seq[0];
  const pv = seq
    .split(';')
    .filter((move) => move.search(/[BW]\[[^\]]/) === 0)
    .map((move) => iaToJ19(move.substring(2, 4)))
    .join(' ');

  return pv.indexOf(' ') >= 0 ? pl + pv : pv;
}

// Risky but effective.
// Fixes SGF dialects (KO/TE/RD) for other SGF editors.
// Fixes bad Tygem SGF. e.g., '대주배 16강 .'
// Fixes bad Tygem SGF. e.g., '김미리:김미리:4단'.
const correctSGFDialects = (sgf) =>
  sgf
    .replace(/\([;]*TE\[/, '(;GM[1]FF[4]EV[')
    .replace(/\bRD\[/, 'DT[')
    .replace(/\bK[OM]\[\]/, '')
    .replace(/\bKO\[/, 'KM[')
    .replace(/ \.\]/, ']')
    .replace(/(P[BW]\[[^\]:]*):[^\]]*\]/g, '$1]');

const ofRoot = (root, key) => root[key] && root[key][0];

// Makes file name from SGF.
//
// e.g., '[제22회 농심배 13국, 2021-02-25] 커제 vs 신진서 (185수 흑불계승).sgf'
function prettyPathFromSGF(sgf) {
  // Fixes bad Tygem SGF. e.g., '대주배 16강 .'
  const rs = rootAndSeqFromSGF(sgf.replace(' .', ''));
  const evgndt = [
    ofRoot(rs.root, 'EV') || ofRoot(rs.root, 'GN'),
    ofRoot(rs.root, 'DT'),
  ]
    .filter((v) => v)
    .join(', ');
  const evdt = evgndt ? `[${evgndt}]` : '';
  const re = ofRoot(rs.root, 'RE') ? `(${ofRoot(rs.root, 'RE')})` : '';
  const pw = ofRoot(rs.root, 'PW');
  const pb = ofRoot(rs.root, 'PB');
  const pls = pw && pb ? `${pw} vs ${pb}` : '';

  return `${[evdt, pls, re].filter((v) => v).join(' ')}.sgf`;
}

// 2000 => '2k'
const formatK = (num) =>
  Math.abs(num) > 999
    ? `${Math.sign(num) * (Math.abs(num) / 1000).toFixed(1)}k`
    : Math.sign(num) * Math.abs(num);

const mkNode = (data) => {
  if (data.B) return `;B[${data.B[0]}]`;
  if (data.W) return `;W[${data.W[0]}]`;
  return '';
};

// Node of '@sabaki/sgf' => ';B[kk];W[aa];B[bb]'
const seqFromObject = (node) =>
  node.children.length
    ? mkNode(node.data) + seqFromObject(node.children[0])
    : mkNode(node.data);

const addPropValue = (acc, v) => `${acc}[${v.trim().replace(/\]/g, '\\]')}]`;

// { A: ['0'], B: ['a', 'b'] } => 'A[0]B[a][b]'
const propsFromObject = (obj, comment) =>
  Object.keys(obj).reduce(
    (acc, cur) =>
      !comment && cur === 'C'
        ? acc
        : acc + cur + obj[cur].reduce(addPropValue, ''),
    ';',
  );

const isNotPassingMove = (move, sz = 19) =>
  sz < 20
    ? move.search(/\b[BW]\[[^\]]/) !== -1 &&
      move.search(/\b[BW]\[tt\]/) === -1
    : move.search(/\b[BW]\[[^\]]/) !== -1;

// Notice that all the comments are removed.
//
// '(FF[4]GM[1]C[test];B[aa]C[test];(B[bb])(B[cc])'
//   => { root: { FF: '4', GM: '1' }, seq: ';B[aa];B[bb]' }
function rootAndSeqFromSGF(sgf) {
  const nodes = sgfparser.parse(sgf);
  delete nodes[0].data.C;
  return {
    root: nodes[0].data,
    seq: seqFromObject(nodes[0]),
  };
}

// ';W[aa];B[];W[bb]' => true
// ';W[aa];B[tt];W[bb]' => true
// ';W[aa];B[cc];W[bb]' => false
const hasPassingMoves = (seq, sz = 19) =>
  seq
    .split(';')
    .filter((v) => v)
    .some((node) => !isNotPassingMove(node, sz));

// Strips tail, comments, and line feeds from SGF.
function removeTails(sgf, comment) {
  const nodes = sgfparser.parse(sgf.replace(/\r\n/g, '').replace(/\n/g, ''));
  return `(${
    propsFromObject(nodes[0].data, comment) + seqFromObject(nodes[0])
  })`;
}

module.exports = {
  iaFromJ1,
  iaToJ1,
  iaToJ19,
  addProperty,
  toGoodNode,
  toBadNode,
  toBadHotSpot,
  addComment,
  removeTails,
  isNotPassingMove,
  rootAndSeqFromSGF,
  correctSGFDialects,
  prettyPathFromSGF,
  propsFromObject,
  seqFromObject,
  formatK,
  hasPassingMoves,
  seqToPV,
};
