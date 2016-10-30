import { NamedPage } from '../misc/PageLoader';
import io from '../utils/io';
import domUpdate from '../utils/domUpdate';

const page = new NamedPage('submission_detail', () => {
  const socket = io.connect('/submission/submission_detail', { ...Context });
  socket.on('info', data => {
    console.log(data);
  });
  /*
  domUpdate.setup(socket, {
    update_match_status: {},
    update_round_row: {
      $container: $('#round_row_container'),
    },
  });*/
});

export default page;
