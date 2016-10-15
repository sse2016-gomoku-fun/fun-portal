import _ from 'lodash';
import uuid from 'uuid';
import mongoose from 'mongoose';
import objectId from 'libs/objectId';
import errors from 'libs/errors';

export default () => {
  const SubmissionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    code: String,
    executable: Buffer,
    status: String,
    text: String,
    taskToken: String,    // A unique token for each task, so that duplicate tasks
                          // won't be judged multiple times
  }, {
    timestamps: true,
  });

  SubmissionSchema.statics.LIMIT_SIZE_CODE = 1 * 1024 * 1024;
  SubmissionSchema.statics.LIMIT_SIZE_EXECUTABLE = 1 * 1024 * 1024;
  SubmissionSchema.statics.LIMIT_SIZE_TEXT = 100 * 1024;
  SubmissionSchema.statics.LIMIT_MIN_INTERVAL = 1000; //24 * 60 * 60 * 1000;

  SubmissionSchema.statics.STATUS_PENDING = 'pending';
  SubmissionSchema.statics.STATUS_COMPILING = 'compiling';
  SubmissionSchema.statics.STATUS_COMPILE_ERROR = 'ce';
  SubmissionSchema.statics.STATUS_SYSTEM_ERROR = 'se';
  SubmissionSchema.statics.STATUS_RUNNING = 'running';
  SubmissionSchema.statics.STATUS_EFFECTIVE = 'effective';

  SubmissionSchema.statics.STATUS_TEXT = {
    'pending': 'Pending',
    'compiling': 'Compiling',
    'ce': 'Compile Error',
    'se': 'System Error',
    'running': 'Running',
    'effective': 'Effective',
  };

  /**
   * Get the submission object by userId
   *
   * @return {User} Mongoose submission object
   */
  SubmissionSchema.statics.getSubmissionObjectByIdAsync = async function (id, projection = { executable: 0 }, throwWhenNotFound = true) {
    if (!objectId.isValid(id)) {
      if (throwWhenNotFound) {
        throw new errors.UserError('Submission not found');
      } else {
        return null;
      }
    }
    const s = await this.findOne({ _id: id }, projection).exec();
    if (s === null && throwWhenNotFound) {
      throw new errors.UserError('Submission not found');
    }
    return s;
  };

  /**
   * Get all submissions of a user
   *
   * @return {[Submission]}
   */
  SubmissionSchema.statics.getUserSubmissionsAsync = async function (uid, limit = null) {
    let query = this
      .find({ user: uid })
      .sort({ createdAt: -1 });
    if (limit) {
      query = query.limit(limit);
    }
    const submissions = await query.exec();
    return submissions;
  };

  /**
   * Check whether a user is allowed to submit new code
   *
   * @return {Boolean}
   */
  SubmissionSchema.statics.isUserAllowedToSubmitAsync = async function (uid) {
    const submissions = await this.getUserSubmissionsAsync(uid, 1);
    if (submissions.length === 0) {
      return true;
    }
    const last = submissions[0];
    if (last.status === this.STATUS_COMPILE_ERROR) {
      return true;
    }
    if (Date.now() - last.createdAt.getTime() > this.LIMIT_MIN_INTERVAL) {
      return true;
    }
    return false;
  };

  /**
   * Submit new code and create tasks
   *
   * @return {Submission}
   */
  SubmissionSchema.statics.createSubmissionAsync = async function (uid, code) {
    if (!this.isUserAllowedToSubmitAsync(uid)) {
      throw new errors.UserError('You are not allowed to submit new code currently');
    }
    if (code.length > this.LIMIT_SIZE_CODE) {
      throw new errors.ValidationError('Your source code is too large.');
    }
    const newSubmission = new this({
      user: uid,
      code,
      status: this.STATUS_PENDING,
      text: '',
    });
    await newSubmission.save();
    await this._compileForMatchAsync(newSubmission);
    return newSubmission;
  };

  /**
   * Reset status of a submission and push it to the task queue
   *
   * @param  {MongoId|Submission} sidOrSubmission Submission id or Submission object
   * @return {Submission} The new submission object
   */
  SubmissionSchema.statics._compileForMatchAsync = async function (submission) {
    if (submission.taskToken) {
      const error = new Error('Expect taskToken is undefined');
      DI.logger.error(error);
      throw error;
    }
    submission.executable = null;
    submission.status = this.STATUS_PENDING;
    submission.text = '';
    submission.taskToken = uuid.v4();
    await submission.save();
    await DI.mq.publish('compile', {
      id: String(submission._id),
      token: submission.taskToken,
    });
    return submission;
  };

  /**
   * Get each users' last effective or running submission
   *
   * @param  {Boolean} onlyEffective
   * @return {[{_id, submissionId}]}
   */
  SubmissionSchema.statics.getLastSubmissionsByUserAsync = async function (onlyEffective = true) {
    let statusMatchExp;
    if (onlyEffective) {
      statusMatchExp = this.STATUS_EFFECTIVE;
    } else {
      statusMatchExp = { $in: [ this.STATUS_RUNNING, this.STATUS_EFFECTIVE ] };
    }
    return await this.aggregate([
      { $match: { status: statusMatchExp } },
      { $sort: { createdAt: -1 } },
      { $project: { user: 1, createdAt : 1, status: 1 } },
      { $group: { _id: '$user', submissionId: { $first: '$_id' } } },
    ]).allowDiskUse(true).exec();
  };

  /**
   * Mark a submission as compiling and return the submission if the given taskToken
   * matches the submission
   *
   * @param  {MongoId} sid
   * @param  {String} taskToken
   * @return {Submission}
   */
  SubmissionSchema.statics.judgeStartCompileAsync = async function (sid, taskToken) {
    const sdoc = await this.getSubmissionObjectByIdAsync(sid);
    if (sdoc.taskToken !== taskToken) {
      throw new errors.UserError('Task token does not match');
    }
    sdoc.status = this.STATUS_COMPILING;
    await sdoc.save();
    // TODO: eventbus
    return sdoc;
  };

  /**
   * Mark a submission as System Error
   *
   * @param  {MongoId} sid
   * @param  {String} taskToken
   * @param  {String} text
   * @return {Submission}
   */
  SubmissionSchema.statics.judgeSetSystemErrorAsync = async function (sid, taskToken, text) {
    const sdoc = await this.getSubmissionObjectByIdAsync(sid);
    if (sdoc.taskToken !== taskToken) {
      throw new errors.UserError('Task token does not match');
    }
    sdoc.text = text;
    sdoc.status = this.STATUS_SYSTEM_ERROR;
    await sdoc.save();
    return sdoc;
  };

  /**
   * Mark a submission as Compile Error or Running and return the submission if the
   * given taskToken matches the submission. For success compiling, it will prepare
   * matches and push match task to the queue.
   *
   * @param  {MongoId} sid
   * @param  {String} taskToken
   * @param  {Boolean} success
   * @param  {String} text
   * @param  {Buffer} exeBuffer
   * @return {Submisison}
   */
  SubmissionSchema.statics.judgeCompleteCompileAsync = async function (sid, taskToken, success, text, exeBuffer = null) {
    if (!success && exeBuffer !== null) {
      throw new Error('No executable should be supplied');
    }
    const sdoc = await this.getSubmissionObjectByIdAsync(sid);
    if (sdoc.taskToken !== taskToken) {
      throw new errors.UserError('Task token does not match');
    }
    sdoc.text = text;
    sdoc.status = success ? this.STATUS_RUNNING : this.STATUS_COMPILE_ERROR;
    if (success && exeBuffer !== null) {
      sdoc.executable = exeBuffer;
    }
    await sdoc.save();
    if (success) {
      await this._createMatchAsync(sdoc);
    }
    return sdoc;
  };

  /**
   * Create related matches for specified submission
   */
  SubmissionSchema.statics._createMatchAsync = async function (submission) {
    const compilingSubmissions = await this.find({ status: this.STATUS_COMPILING }).count();
    if (compilingSubmissions !== 0) {
      const error = new Error(`Expect compilingSubmissions is 0, got ${compilingSubmissions}`);
      DI.logger.error(error);
      // don't throw any errors
    }
    const lsdocs = await this.getLastSubmissionsByUserAsync(false);
    const matches = await DI.models.Match.addMatchesForSubmissionAsync(
      submission._id,
      submission.user,
      _.filter(lsdocs, lsdoc => !lsdoc._id.equals(submission.user))
    );
    // push each round of each match into the queue
    for (const match of matches) {
      for (const round of match.rounds) {
        await DI.mq.publish('judge', {
          matchId: String(match._id),
          s1Id: String(match.u1Submission),
          s2Id: String(match.u2Submission),
          round: round,
        });
      }
    }
  };

  SubmissionSchema.index({ user: 1, createdAt: -1 });
  SubmissionSchema.index({ status: 1, createdAt: -1 });

  return mongoose.model('Submission', SubmissionSchema);
};
