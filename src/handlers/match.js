import * as web from 'express-decorators';
import multer from 'multer';
import fsp from 'fs-promise';
import utils from 'libs/utils';
import sanitizers from 'libs/sanitizers';
import errors from 'libs/errors';
import permissions from 'libs/permissions';
import socket from 'libs/socket';

// file limit is infinity
const logUpload = multer({
  storage: multer.diskStorage({}),
});

@socket.enable()
@web.controller('/match')
export default class Handler {

  @web.post('/api/roundBegin')
  @web.middleware(utils.sanitizeBody({
    mid: sanitizers.nonEmptyString(),
    rid: sanitizers.nonEmptyString(),
  }))
  @web.middleware(utils.checkAPI())
  async apiRoundBegin(req, res) {
    const mdoc = await DI.models.Match.judgeStartRoundAsync(
      req.data.mid,
      req.data.rid
    );
    res.json(mdoc);
  }

  @web.post('/api/roundError')
  @web.middleware(utils.sanitizeBody({
    mid: sanitizers.nonEmptyString(),
    rid: sanitizers.nonEmptyString(),
    text: sanitizers.nonEmptyString(),
  }))
  @web.middleware(utils.checkAPI())
  async apiRoundError(req, res) {
    const mdoc = await DI.models.Match.judgeCompleteRoundAsync(
      req.data.mid,
      req.data.rid,
      DI.models.Match.STATUS_SYSTEM_ERROR,
      {
        text: req.data.text,
      }
    );
    res.json(mdoc);
  }

  @web.post('/api/roundComplete')
  @web.middleware(utils.sanitizeBody({
    mid: sanitizers.nonEmptyString(),
    rid: sanitizers.nonEmptyString(),
    exitCode: sanitizers.int(),
    summary: sanitizers.nonEmptyString(),
  }))
  @web.middleware(logUpload.single('log'))
  @web.middleware(utils.checkAPI())
  async apiRoundComplete(req, res) {
    if (!req.file) {
      throw new errors.UserError('Expect logs');
    }
    const file = await DI.gridfs.putBlobAsync(fsp.createReadStream(req.file.path), {
      contentType: 'text/plain',
      metadata: {
        type: 'match.log',
        match: req.data.mid,
        round: req.data.rid,
      },
    });
    try {
      await fsp.remove(req.file.path);
    } catch (err) {
      DI.logger.error(err);
    }
    const mdoc = await DI.models.Match.judgeCompleteRoundAsync(
      req.data.mid,
      req.data.rid,
      DI.models.Match.getStatusFromJudgeExitCode(req.data.exitCode),
      {
        summary: req.data.summary,
        logBlob: file._id,
        text: '',
      }
    );
    res.json(mdoc);
  }

  @web.get('/refreshStatus')
  @web.middleware(utils.checkPermission(permissions.REFRESH_MATCH_STATUS))
  async manageRefreshStatus(req, res) {
    const result = await DI.models.Match.refreshAllMatchesAsync();
    res.json(result);
  }

  @web.get('/:id')
  async getMatchDetailAction(req, res) {
    const mdoc = await DI.models.Match.getMatchObjectByIdAsync(req.params.id);
    await mdoc.populate('u1 u2 u1Submission u2Submission').execPopulate();
    res.render('match_detail', {
      page_title: 'Match Detail',
      mdoc,
    });
  }

  @socket.namespace('/match_detail')
  async socketMatchDetailConnect(socket, query, nsp) {
    DI.eventBus.on(`match.statusChanged::${socket.id}`, mdoc => {
      if (!mdoc._id.equals(query.id)) {
        return;
      }
      socket.emit('update_match_status', {
        html: DI.webTemplate.render('partials/match_detail_match_status.html', { mdoc }),
      });
    });
    DI.eventBus.on(`match.round.updated::${socket.id}`, (mdoc, rdoc) => {
      if (!mdoc._id.equals(query.id)) {
        return;
      }
      socket.emit('update_round_row', {
        html: DI.webTemplate.render('partials/match_detail_round_row.html', { mdoc, rdoc }),
      });
    });
    socket.on('disconnect', () => {
      DI.eventBus.removeAllListeners(`match.statusChanged::${socket.id}`);
      DI.eventBus.removeAllListeners(`match.round.updated::${socket.id}`);
    });
  }

  @web.get('/:id/round/:rid')
  async getMatchRoundDetailAction(req, res) {
    const mdoc = await DI.models.Match.getMatchObjectByIdAsync(req.params.id);
    await mdoc.populate('u1 u2 u1Submission u2Submission').execPopulate();
    const rdocIndex = mdoc.rounds.findIndex(rdoc => rdoc._id.equals(req.params.rid));
    if (rdocIndex === -1) {
      throw new errors.UserError('Round not found');
    }
    const rdoc = mdoc.rounds[rdocIndex];
    res.render('round_detail', {
      page_title: 'Round Detail',
      mdoc,
      rdoc,
      rdocIndex,
    });
  }

  @web.get('/:id/round/:rid/logs')
  async getMatchRoundLogsAction(req, res) {
    const mdoc = await DI.models.Match.getMatchObjectByIdAsync(req.params.id);
    const rdoc = mdoc.rounds.find(rdoc => rdoc._id.equals(req.params.rid));
    if (rdoc === undefined) {
      throw new errors.UserError('Round not found');
    }
    if (!rdoc.logBlob) {
      throw new errors.UserError('Logs not available for this round');
    }
    //res.setHeader('Content-disposition', `attachment; filename=${req.params.id}-${req.params.rid}.txt`);
    await DI.gridfs.getBlobAsync(rdoc.logBlob, res);
  }

}
