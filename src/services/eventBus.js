import { EventEmitter2 } from 'eventemitter2';
import utils from 'libs/utils';

export default () => {

  const eventBus = new EventEmitter2({
    wildcard: true,
    delimiter: '::',
    newListener: false,
    maxListeners: 0,
  });

  eventBus.emitAsyncWithProfiling = async (name, ...args) => {
    const endProfile = utils.profile(`eventBus.emit(${name})`);
    eventBus.emitAsync(name, ...args);
    endProfile();
  };

  /*
  eventBus.on('match.new', (mdoc) => DI.logger.info('match.new %s', mdoc._id));
  eventBus.on('match.statusChanged', (mdoc) => DI.logger.info('match.statusChanged %s', mdoc._id));
  eventBus.on('match.round.statusChanged', (mdoc, rdoc) => DI.logger.info('match.round.statusChanged %s %s', mdoc._id, rdoc._id));
  eventBus.on('submission.new', (sdoc) => DI.logger.info('submission.new %s', sdoc._id));
  eventBus.on('submission.statusChanged', (sdoc) => DI.logger.info('submission.statusChanged %s', sdoc._id));
  eventBus.on('submission.match.statusChanged', (sdoc, mdoc) => DI.logger.info('submission.match.statusChanged %s %s', sdoc._id, mdoc._id));
  */

  return eventBus;

};
