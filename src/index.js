#!/usr/bin/env node

/**
 * @fileOverview Command line interface for analyze-sgf.
 */

const fs = require('fs');
const syspath = require('path');
const homedir = require('os').homedir();
const chalk = require('chalk');
const jschardet = require('jschardet');
const iconv = require('iconv-lite');
const { spawn } = require('child_process');
const progress = require('cli-progress');

const getopts = require('./getopts');
const sgfconv = require('./sgfconv');
const katagoconv = require('./katagoconv');
const GameTree = require('./gametree');
const toSGF = require('./gib2sgf');
const { httpget, isValidURL } = require('./httpget');

const log = (message) => console.error(chalk.grey(message));
const config = `${homedir}${syspath.sep}.analyze-sgf.yml`;
const getext = (path) =>
  path.substring(1 + path.lastIndexOf('.'), path.length).toLowerCase();

// Parses args and merges them with yaml config.
const opts = getopts();

// Starts async communication with KataGo.
(async () => {
  if (opts.jsonGiven) {
    // Analyzes by KataGo Analysis JSON, not by KataGO Analysis Engine.
    opts.paths.forEach((path) => {
      try {
        const ext = getext(path);
        if (ext !== 'json') {
          log(`skipped: ${path}`);
          return;
        }

        const sgfresponses = fs.readFileSync(path).toString();
        // JSON file format: tailless SGF + '\n' + KataGo responses.
        const index = sgfresponses.indexOf('\n');
        const sgf = sgfresponses.substring(0, index);
        const responses = sgfresponses.substring(index + 1);

        saveAnalyzed(path, sgf, responses, false, opts.sgf);
      } catch (error) {
        log(`${error.message}, while processing: ${path}`);
      }
    });
  } else {
    // Analyzes by KataGo Analysis Engine.
    //
    // Reads SGF and makes KagaGo query.
    opts.paths.map(async (path) => {
      try {
        const ext = getext(path);
        const isURL = isValidURL(path);
        if (ext !== 'sgf' && ext !== 'gib' && !isURL) {
          log(`skipped: ${path}`);
          return;
        }

        let sgf;
        let newPath;

        // Gets SGF from web server.
        if (!isURL) {
          const content = fs.readFileSync(path);
          const detected = jschardet.detect(content);
          sgf = iconv.decode(content, detected.encoding).toString();
          if (ext === 'gib') sgf = toSGF(sgf);
          newPath = path;
        } else {
          sgf = httpget(path);
          newPath = sgfconv.prettyPathFromSGF(sgf);
          fs.writeFileSync(newPath, sgf);
          log(`downloaded: ${newPath}`);
        }

        const query = katagoconv.sgfToKataGoAnalysisQuery(sgf, opts.analysis);

        // Sends query to KataGo.
        let responses = await kataGoAnalyze(query, opts.katago);
        // KataGoAnalyze already has printed error message.
        if (!responses) return;

        // If revisit given, try again.
        if (opts.revisit) {
          query.maxVisits = opts.revisit;
          query.analyzeTurns = katagoconv.winrateDropTurnsFromKatagoResponses(
            responses,
            opts.sgf.minWinrateDropForVariations / 100,
          );

          let responsesRe = '';
          if (query.analyzeTurns) {
            responsesRe = await kataGoAnalyze(query, opts.katago);
            if (!responsesRe) log('revisit error');
            else
              responses = katagoconv.joinKataGoResponses(
                responses,
                responsesRe,
                query.analyzeTurns,
              );
          }
        }
        // Finally, saves them.
        saveAnalyzed(newPath, sgf, responses, opts.saveGiven, opts.sgf);
      } catch (error) {
        log(`${error.message}, while processing: ${path}`);
      }
    });
  }
})();

// Saves SGF file and JSON responses from KataGo.
function saveAnalyzed(targetPath, sgf, responses, saveResponse, sgfOpts) {
  if (!responses) {
    throw Error('No response from KataGo');
  }
  if (responses.search('{"error":"') === 0) {
    throw Error(responses.replace('\n', ''));
  }

  const targetName = targetPath.substring(0, targetPath.lastIndexOf('.'));

  // Saves analysis responses to JSON.
  if (saveResponse) {
    const jsonPath = `${targetName}.json`;

    // JSON file format: tailless SGF + '\n' + KataGo responses.
    fs.writeFileSync(jsonPath, `${sgfconv.removeTails(sgf)}\n${responses}`);
    log(`generated: ${jsonPath}`);
  }

  // Saves analyzed SGF.
  const gametree = new GameTree(sgf, responses, sgfOpts);
  const sgfPath = `${targetName}${sgfOpts.fileSuffix}.sgf`;

  fs.writeFileSync(sgfPath, gametree.getSGF());
  log(`generated: ${sgfPath}`);

  const report = gametree.getReport();
  if (report) {
    console.log(report);
  }
}

// FIXME: No respawn.
// Requests analysis to KataGo, and reads responses.
async function kataGoAnalyze(query, katagoOpts) {
  const katago = spawn(`${katagoOpts.path} ${katagoOpts.arguments}`, [], {
    shell: true,
  });

  katago.on('exit', (code) => {
    if (code !== 0) {
      log(
        `KataGo exec failure. Please fix: ${config}` +
          `\n${JSON.stringify(katagoOpts)}`,
      );
      process.exit(1);
    }
  });

  const opt = {
    format:
      '{bar} {percentage}% ({value}/{total}, ' +
      `${sgfconv.formatK(query.maxVisits)} visits) | ` +
      'ETA: {eta_formatted} ({duration_formatted})',
    barCompleteChar: '■',
    barIncompleteChar: ' ',
    barsize: 30,
  };
  const bar = new progress.SingleBar(opt, progress.Presets.rect);
  bar.start(query.analyzeTurns.length, 0);
  let count = 0;

  // Sends query to KataGo.
  await katago.stdin.write(`${JSON.stringify(query)}\n`);
  katago.stdin.end();

  // Reads analysis from KataGo.
  let responses = '';
  // eslint-disable-next-line no-restricted-syntax
  for await (const data of katago.stdout) {
    responses += data;
    count += (data.toString().match(/\n/g) || []).length;
    bar.update(count);
  }

  bar.stop();
  return responses;
}
