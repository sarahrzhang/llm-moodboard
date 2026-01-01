import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3001 });

wss.on('connection', (ws) => {
  console.log('Client connected to WS');

  ws.on('message', (msg) => {
    console.log('Received message: ', msg.toString());
    ws.send(`Echo: ${msg}`);
  })

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log('WebSocket server running on ws://localhost:3001');