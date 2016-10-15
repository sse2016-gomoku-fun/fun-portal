import * as web from 'express-decorators';
import multer from 'multer';
import fsp from 'fs-promise';
import _ from 'lodash';
import utils from 'libs/utils';
import errors from 'libs/errors';
import permissions from 'libs/permissions';

const upload = multer({
  storage: multer.diskStorage({}),
  limits: {
    fieldSize: Math.max(
      DI.models.Submission.LIMIT_SIZE_CODE,
      DI.models.Submission.LIMIT_SIZE_EXECUTABLE,
      DI.models.Submission.LIMIT_SIZE_TEXT
    ) * 2,
    fileSize: DI.models.Submission.LIMIT_SIZE_EXECUTABLE * 2,
  },
});

@web.controller('/submission')
export default class Handler {

  @web.use()
  async navType(req, res, next) {
    res.locals.nav_type = 'submission';
    next();
  }

  @web.get('/')
  @web.middleware(utils.checkLogin())
  async getSubmissionAction(req, res) {
    const sdocs = await DI.models.Submission.getUserSubmissionsAsync(req.credential._id);
    res.render('submission_main', {
      page_title: 'My Submissions',
      sdocs,
    });
  }

  @web.get('/create')
  @web.middleware(utils.checkProfile())
  @web.middleware(utils.checkLogin())
  async getSubmissionCreateAction(req, res) {
    res.render('submission_create', {
      page_title: 'Submit My Brain',
      canSubmit: await DI.models.Submission.isUserAllowedToSubmitAsync(req.credential._id),
    });
  }

  @web.post('/create')
  @web.middleware(utils.sanitizeBody({
    code: utils.checkNonEmptyString(),
  }))
  @web.middleware(utils.checkProfile())
  @web.middleware(utils.checkLogin())
  async postSubmissionCreateAction(req, res) {
    await DI.models.Submission.createSubmissionAsync(
      req.credential._id,
      req.data.code
    );
    res.redirect(utils.url('/submission'));
  }

  @web.get('/:id')
  @web.middleware(utils.checkLogin())
  async getSubmissionDetailAction(req, res) {
    const sdoc = await DI.models.Submission.getSubmissionObjectByIdAsync(req.params.id);
    if (
      !sdoc.user.equals(req.credential._id)
      && !req.credential.hasPermission(permissions.PERM_VIEW_ALL_SUBMISSION)
    ) {
      throw new errors.PermissionError();
    }
    await sdoc.populate('user').execPopulate();
    res.render('submission_detail', {
      page_title: 'Submission Detail',
      sdoc,
    });
  }

  @web.get('/api/limits')
  @web.middleware(utils.checkAPI())
  async apiGetLimitations(req, res) {
    res.json(_.pick(DI.models.Submission, [
      'LIMIT_SIZE_EXECUTABLE',
      'LIMIT_SIZE_TEXT',
    ]));
  }

  @web.post('/api/compileBegin')
  @web.middleware(utils.sanitizeBody({
    id: utils.checkNonEmptyString(),
    token: utils.checkNonEmptyString(),
  }))
  @web.middleware(utils.checkAPI())
  async apiCompileBegin(req, res) {
    const sdoc = await DI.models.Submission.judgeStartCompileAsync(req.data.id, req.data.token);
    await sdoc.populate('user').execPopulate();
    res.json(sdoc);
  }

  @web.post('/api/compileError')
  @web.middleware(utils.sanitizeBody({
    id: utils.checkNonEmptyString(),
    token: utils.checkNonEmptyString(),
    text: utils.checkString(),
  }))
  @web.middleware(utils.checkAPI())
  async apiCompileError(req, res) {
    const sdoc = await DI.models.Submission.judgeSetSystemErrorAsync(
      req.data.id,
      req.data.token,
      req.data.text
    );
    res.json(sdoc);
  }

  @web.post('/api/compileEnd')
  @web.middleware(utils.sanitizeBody({
    id: utils.checkNonEmptyString(),
    token: utils.checkNonEmptyString(),
    text: utils.checkString(),
    success: utils.checkBool(),
  }))
  @web.middleware(upload.single('binary'))
  @web.middleware(utils.checkAPI())
  async apiCompileEnd(req, res) {
    let buffer = null;
    if (req.data.success && req.file) {
      buffer = await fsp.readFile(req.file.path);
      try {
        await fsp.remove(req.file.path);
      } catch (ignore) {
      }
    }
    const sdoc = await DI.models.Submission.judgeCompleteCompileAsync(
      req.data.id,
      req.data.token,
      req.data.success,
      req.data.text,
      buffer,
    );
    res.json(sdoc);
  }

}
