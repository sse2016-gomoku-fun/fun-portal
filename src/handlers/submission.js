import * as web from 'express-decorators';
import utils from 'libs/utils';
import errors from 'libs/errors';
import permissions from 'libs/permissions';

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
    const sdocs = await DI.models.Submission.getUserSubmissionsAsync(req.session.user._id);
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
      canSubmit: await DI.models.Submission.isUserAllowedToSubmitAsync(req.session.user._id),
    });
  }

  @web.post('/create')
  @web.middleware(utils.sanitizeBody({
    code: utils.checkNonEmpty(),
  }))
  @web.middleware(utils.checkProfile())
  @web.middleware(utils.checkLogin())
  async postSubmissionCreateAction(req, res) {
    await DI.models.Submission.createSubmissionAsync(
      req.session.user._id,
      req.data.code
    );
    res.redirect(utils.url('/submission'));
  }

  @web.get('/:id')
  @web.middleware(utils.checkLogin())
  async getSubmissionDetailAction(req, res) {
    const sdoc = await DI.models.Submission.getSubmissionObjectByIdAsync(req.params.id);
    if (
      String(sdoc.user) !== String(req.session.user._id)
      && !req.session.user.hasPermission(permissions.PERM_VIEW_ALL_SUBMISSION)
    ) {
      throw new errors.PermissionError();
    }
    await sdoc.populate('user').execPopulate();
    res.render('submission_detail', {
      page_title: 'Submission Detail',
      sdoc,
    });
  }

  @web.post('/api/startCompile')
  @web.middleware(utils.sanitizeBody({
    id: utils.checkNonEmpty(),
    token: utils.checkNonEmpty(),
  }))
  @web.middleware(utils.checkAPI())
  async apiStartCompile(req, res) {
    const sdoc = await DI.models.Submission.judgeStartCompileAsync(req.body.id, req.body.token);
    await sdoc.populate('user').execPopulate();
    res.json(sdoc);
  }

  @web.post('/api/completeCompile')
  @web.middleware(utils.sanitizeBody({
    id: utils.checkNonEmpty(),
    token: utils.checkNonEmpty(),
  }))
  @web.middleware(utils.checkAPI())
  async apiCompleteCompile(req, res) {
    res.json({});
    //const sdoc = await DI.models.Submission.judgeCompleteCompileAsync(req.body.id, req.body.token);
  }

}
