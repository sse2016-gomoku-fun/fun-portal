import _ from 'lodash';
import validator from 'validator';
import auth from 'basic-auth';
import errors from 'libs/errors';

const utils = {};

utils.substitute = (str, obj) => {
  return str.replace(/\{([^{}]+)\}/g, (match, key) => {
    if (obj[key] !== undefined) {
      return String(obj[key]);
    }
    return `{${key}}`;
  });
};

utils.url = (s, absolute = false, obj = null) => {
  let url = `${DI.config.urlPrefix}${s}`;
  if (absolute) {
    url = `${DI.config.host}${url}`;
  }
  if (obj === null) {
    return url;
  }
  return utils.substitute(url, obj);
};

utils.static_url = (s) => {
  return `${DI.config.cdnPrefix}${s}`;
};

utils.checkLogin = () => (req, res, next) => {
  if (!req.session.user) {
    throw new errors.PermissionError();
  }
  next();
};

utils.checkProfile = () => (req, res, next) => {
  if (!req.session.user) {
    next();
    return;
  }
  if (req.session.user.profile.initial) {
    res.redirect(utils.url('/user/profile'));
    return;
  }
  next();
};

utils.checkAPI = () => (req, res, next) => {
  const credentials = auth(req);
  if (!credentials
    || credentials.name !== DI.config.api.credential.username
    || credentials.pass !== DI.config.api.credential.password
  ) {
    throw new errors.PermissionError();
  }
  next();
};

const sanitize = (source, patterns) => {
  const ret = {};
  for (var key in patterns) {
    if (source[key] === undefined) {
      throw new errors.ValidationError(`Missing required parameter '${key}'`);
    }
    try {
      ret[key] = patterns[key](String(source[key]));
    } catch (err) {
      throw new errors.ValidationError(`Parameter '${key}' is expected to be a(n) ${err.message}`);
    }
  }
  return ret;
};

const sanitizeExpress = (sourceAttribute, patterns) => (req, res, next) => {
  if (req.data === undefined) {
    req.data = {};
  }
  try {
    _.assign(req.data, sanitize(req[sourceAttribute], patterns));
    next();
  } catch (err) {
    next(err);
  }
};

utils.sanitizeBody = (patterns) => sanitizeExpress('body', patterns);

utils.sanitizeQuery = (patterns) => sanitizeExpress('query', patterns);

utils.checkInt = () => (str) => {
  if (!validator.isInt(str)) {
    throw new Error('integer number');
  }
  return validator.toInt(str);
};

utils.checkNonEmpty = () => (str) => {
  if (str.trim().length === 0) {
    throw new Error('non empty string');
  }
  return str.trim();
};

export default utils;
