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
  SubmissionSchema.statics.LIMIT_SIZE_EXECUTABLE = 5 * 1024 * 1024;
  SubmissionSchema.statics.LIMIT_MIN_INTERVAL = 1000;//24 * 60 * 60 * 1000;

  SubmissionSchema.statics.STATUS_PENDING = 'pending';
  SubmissionSchema.statics.STATUS_COMPILING = 'compiling';
  SubmissionSchema.statics.STATUS_COMPILE_ERROR = 'ce';
  SubmissionSchema.statics.STATUS_RUNNING = 'running';
  SubmissionSchema.statics.STATUS_EFFECTIVE = 'effective';

  SubmissionSchema.statics.STATUS_TEXT = {
    'pending': 'Pending',
    'compiling': 'Compiling',
    'ce': 'Compile Error',
    'running': 'Running',
    'effective': 'Effective',
  };

  /**
   * Get the submission object by userId
   * @return {User} Mongoose submission object
   */
  SubmissionSchema.statics.getSubmissionObjectByIdAsync = async function (id, projection = {}, throwWhenNotFound = true) {
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
   * Submit new code
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
    await this.compileForMatchAsync(newSubmission);
    return newSubmission;
  };

  /**
   * Reset status of a submission and push it to the task queue
   * @param  {MongoId|Submission} sidOrSubmission Submission id or Submission object
   * @return {Submission} The new submission object
   */
  SubmissionSchema.statics.compileForMatchAsync = async function (sidOrSubmission) {
    let submission;
    if (objectId.isValid(sidOrSubmission)) {
      submission = this.getSubmissionObjectByIdAsync(sidOrSubmission);
    } else {
      submission = sidOrSubmission;
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

  SubmissionSchema.statics.judgeStartCompileAsync = async function (sid, taskToken) {
    const sdoc = await this.getSubmissionObjectByIdAsync(sid);
    if (sdoc.taskToken !== taskToken) {
      throw new errors.UserError('Task token does not match');
    }
    sdoc.status = this.STATUS_COMPILING;
    await sdoc.save();
    return sdoc;
  };

  SubmissionSchema.statics.judgeCompleteCompileAsync = async function (sid, taskToken, success, text, executable = null) {
    if (!success && executable !== null) {
      throw new errors.UserError('No executable should be supplied');
    }
    const sdoc = await this.getSubmissionObjectByIdAsync(sid);
    if (sdoc.taskToken !== taskToken) {
      throw new errors.UserError('Task token does not match');
    }
    sdoc.text = text;
    sdoc.status = success ? this.STATUS_RUNNING : this.STATUS_COMPILE_ERROR;
    await sdoc.save();
    if (success) {
      // TODO
    }
    return sdoc;
  };

  SubmissionSchema.index({ user: 1, createdAt: -1 });

  return mongoose.model('Submission', SubmissionSchema);
};
