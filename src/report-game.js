/**
 * @fileOverview Generate the game report on players info, good moves,
 *               bad moves, and bad hot spots.
 */

// [1, 2, 5] => 'move 1, move 2, move 5'
function joinmoves(moves) {
  return moves
    .sort((a, b) => a - b)
    .map((x) => `move ${x + 1}`)
    .join(', ');
}

// ('Bad moves', [39, 69, 105, 109, ...], 104) =>
// '* Bad moves (11.54%, 12/104): move 39, move 69, move 105, move 109, ...'
function movesstat(goodorbad, moves, total, listmoves = true) {
  if (!moves.length) {
    return '';
  }

  const ratio = ((moves.length / total) * 100).toFixed(2);
  let format = `* ${goodorbad} (${ratio}%, ${moves.length}/${total})`;

  if (listmoves) {
    format += `: ${joinmoves(moves)}`;
  }

  return `${format}\n`;
}

function reportGoodAndBad(total, moves) {
  return (
    movesstat('Good moves', moves[0], total, false) +
    movesstat('Bad moves', moves[1], total) +
    movesstat('Bad hot spots', moves[2], total)
  );
}

// (' 신진서  ', 'Black') => '신진서 (Black):'
// ('', 'Black') => 'Black:'
function colorPL(player, color) {
  let pl = player.replace(/ *$/, '').replace(/^ */, '');

  if (pl !== '') {
    pl += ` (${color}):`;
  } else {
    pl = `${color}:`;
  }

  return pl;
}

// Generates report.
function reportGame(
  stat,
  goodmovewinrate,
  badmovewinrate,
  badhotspotwinrate,
  variationwinrate,
  maxvariations,
  visits,
) {
  const pb = colorPL(stat.pb, 'Black');
  const pw = colorPL(stat.pw, 'White');

  return (
    `# Analyze-SGF Report` +
    `\n\n${pb}\n${reportGoodAndBad(stat.blacksTotal, stat.blackGoodBads)}` +
    `\n${pw}\n${reportGoodAndBad(stat.whitesTotal, stat.whiteGoodBads)}` +
    `\nGood move: less than ${goodmovewinrate * 100}% win rate loss` +
    `\nBad move: more than ${badmovewinrate * 100}% win rate loss` +
    `\nBad hot spot: more than ${badhotspotwinrate * 100}% win rate loss` +
    `\n\nVariations added for the moves of more than ` +
    `${variationwinrate * 100}% win rate loss.` +
    `\nThe maximum variation number for each move is ${maxvariations}.` +
    `\n\nAnalyzed by KataGo Parallel Analysis Engine (${visits} max visits).`
  );
}

module.exports = reportGame;
