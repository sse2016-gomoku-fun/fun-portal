import { EventEmitter2 } from 'eventemitter2';

export default () => {

  const eventBus = new EventEmitter2({
    wildcard: true,
    delimiter: '::',
    newListener: false,
    maxListeners: 0,
  });

  eventBus.on('match.new', (mdoc) => console.log('match.new %s', mdoc._id));
  eventBus.on('match.statusChanged', (mdoc) => console.log('match.statusChanged %s', mdoc._id));
  eventBus.on('match.round.statusChanged', (mdoc, rdoc) => console.log('match.round.statusChanged %s %s', mdoc._id, rdoc._id));
  eventBus.on('submission.new', (sdoc) => console.log('submission.new %s', sdoc._id));
  eventBus.on('submission.statusChanged', (sdoc) => console.log('submission.statusChanged %s', sdoc._id));
  eventBus.on('submission.match.statusChanged', (sdoc, mdoc) => console.log('submission.match.statusChanged %s %s', sdoc._id, mdoc._id));

  return eventBus;

};
