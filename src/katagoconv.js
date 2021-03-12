/**
 * @fileOverview Helper functions for KataGo analysis JSON format.
 */

const sgfconv = require('./sgfconv');

// root => [["B","A1"],["B","B2"],["W","A2"]]
function initialStonesFromRoot(root) {
  return [
    ...(root.AB || []).map((pos) => ['B', sgfconv.iaToJ1(pos)]),
    ...(root.AW || []).map((pos) => ['W', sgfconv.iaToJ1(pos)]),
  ];
}

// ("W", { scoreLead: 21.050, pv:["A1","B2","C3"] }) => '(;W[aa];B[bb];W[cc])'
function seqFromKataGoMoveInfo(pl, moveInfo) {
  const seq = moveInfo.pv.reduce(
    (acc, move) => [
      `${acc[0]};${acc[1]}[${sgfconv.iaFromJ1(move)}]`,
      acc[1] === 'W' ? 'B' : 'W',
    ],
    ['', pl],
  );

  return `(${seq[0]})`;
}

// Makes JSON data to send KataGo Parallel Analysis Engine.
function sgfToKataGoAnalysisQuery(sgf, analysisOpts) {
  const query = { ...analysisOpts };

  // Gets komi from SGF.
  const rs = sgfconv.rootAndSeqFromSGF(sgf);

  if (rs.root.KM) query.komi = parseFloat(rs.root.KM[0]);
  if (rs.root.PL) [query.initialPlayer] = rs.root.PL;
  const sz = rs.root.SZ ? parseInt(rs.root.SZ[0], 10) : 0;

  query.id = `9beach-${Date.now()}`;
  query.initialStones = initialStonesFromRoot(rs.root);
  query.moves = seqToKataGoMoves(rs.seq, sz);

  if (!query.analyzeTurns) {
    query.analyzeTurns = [...Array(query.moves.length + 1).keys()];
  } else if (sgfconv.hasPassingMoves(rs.seq)) {
    const realTurnNumbers = makeRealTurnNumbersMap(rs.seq);
    query.analyzeTurns = query.analyzeTurns
      .map((turn) => realTurnNumbers.indexOf(turn))
      .filter((turn) => turn !== -1);
  }
  return query;
}

// ';W[po];B[hm];W[ae]' => [["W","Q15"],["B","H13"],["W","A5"]]
// ';W[po];TE[1]B[hm];W[]' => [["W","Q15"],["B","H13"]]
// (';W[po];B[hm];W[tt]', 19) => [["W","Q15"],["B","H13"]]
function seqToKataGoMoves(seq, sz = 19) {
  return seq
    .split(';')
    .filter((move) => sgfconv.isNotPassingMove(move, sz))
    .map((move) => {
      const i = move.search(/\b[BW]\[[^\]]/);
      return [move[i], sgfconv.iaToJ1(move.substring(i + 2, i + 4))];
    });
}

const getTurnNumber = (a) => parseInt(a.replace(/.*:/, ''), 10);

// Overwrites revisited to original.
function mergeKataGoResponses(original, revisited, turns) {
  return (
    original
      .split('\n')
      .filter((l) => turns.indexOf(getTurnNumber(l)) === -1)
      .join('\n') + revisited
  );
}

// Makes turnNumber to real turnNumber map.
//
// Passing moves are not included in KataGo system. So we need to convert
// KataGo turnNumber to real turnNumber including passing moves. Real
// turnNumber is map[turnNumber].
function makeRealTurnNumbersMap(seq) {
  return [0].concat(
    seq
      .split(';')
      .filter((v) => v)
      .map((move, index) => (sgfconv.isNotPassingMove(move) ? index + 1 : -1))
      .filter((v) => v !== -1),
  );
}

// Returns array of (turnNumber - 1) whose win rate drops by more than given
// paremeter.
function winrateDropTurnsFromKataGoResponses(responses, winrateDrop) {
  return responses
    .replace(/.*"rootInfo"/g, '{"rootInfo"')
    .split('\n')
    .filter((l) => Boolean(l))
    .map((l) => JSON.parse(l))
    .sort((a, b) => a.turnNumber - b.turnNumber)
    .reduce(
      (acc, cur) => {
        if (
          acc.turnNumber === cur.turnNumber - 1 &&
          Math.abs(acc.winrate - cur.rootInfo.winrate) > winrateDrop
        ) {
          // Adds previous turn number for PVs.
          acc.analyzeTurns.push(acc.turnNumber);
        }
        acc.winrate = cur.rootInfo.winrate;
        acc.turnNumber = cur.turnNumber;
        return acc;
      },
      { analyzeTurns: [] },
    ).analyzeTurns;
}

module.exports = {
  initialStonesFromRoot,
  seqToKataGoMoves,
  seqFromKataGoMoveInfo,
  sgfToKataGoAnalysisQuery,
  mergeKataGoResponses,
  winrateDropTurnsFromKataGoResponses,
  makeRealTurnNumbersMap,
};
