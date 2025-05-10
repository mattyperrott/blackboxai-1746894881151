const netmod = require('./network');
const fs = require('fs');
const net = require('net');

// connect to Android bridge socket
const sock = net.createConnection('/data/data/io.epher.chat/files/epher.sock');

sock.on('data', buf => {
  const msg = JSON.parse(buf.toString());
  if (msg.cmd === 'join') init(msg.room, msg.key);
  else if (msg.cmd === 'send') netmod.sendMessage(JSON.stringify(msg.data));
});

function init(room, key) {
  netmod.initNetwork(room, key, env => {
    sock.write(JSON.stringify(env) + '\n');
  });
}