import _ from 'lodash';
import diff from '../utils/diff';

const domUpdate = {};

domUpdate.setup = (socket, config) => {
  _.forEach(config, (_updateConfig, eventName) => {
    const updateConfig = {
      strategy: null,
      $container: $(document),
      ..._updateConfig,
    };
    socket.on(eventName, udoc => {
      diff.applyForId(updateConfig.$container, udoc.html, updateConfig.strategy);
    });
  });
};

export default domUpdate;
