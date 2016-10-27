import socketio from 'socket.io';

export default (app, webSession) => {

  const io = socketio(app.server, {
    path: `${DI.config.urlPrefix}/socket`,
  });

  io.use((socket, next) => {
    webSession(socket.request, socket.request.res, next);
  });

  return io;

};
