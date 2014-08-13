module.exports = function(server){
  server.models().forEach(function(model){
    model.emit('modelSetupCompleted')
  });
}
