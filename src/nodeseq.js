/**
 * @fileOverview SGF NodeSeq data structure.
 *               Please see <https://homepages.cwi.nl/~aeb/go/misc/sgf.html>.
 */

const Node = require('./node');

// Carries a SGF NodeSeq and its win rate.
class NodeSeq extends Node {
  constructor(seq, title, prevInfo, curInfo, opts) {
    // e.g., '(;B[dp];W[po];B[hm])'.
    super(seq, title);
    super.setWinrate(prevInfo, curInfo, opts);
    // As a seq.
    this.info += `* Sequence: ${this.formatPV().replace(/ \(.*/, '')}\n`;
  }
}

module.exports = NodeSeq;