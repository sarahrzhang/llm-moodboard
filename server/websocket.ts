import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { WebSocketServer } from 'ws';
import Anthropic from '@anthropic-ai/sdk';

const wss = new WebSocketServer({ port: 3001 });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

wss.on('connection', (ws) => {
  console.log('Client connected to WS');

  ws.on('message', async (msg) => {
    type ClientMessage = {
      type: 'analyze';
      prompt: string;
    };

    try {
      const message: ClientMessage = JSON.parse(msg.toString());

      if (message.type === 'analyze') {
        const stream = anthropic.messages.stream({
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          messages: [{ role: 'user', content: message.prompt }],
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            ws.send(JSON.stringify({ type: 'token', data: event.delta.text }));
          }
        }

        ws.send(JSON.stringify({ type: 'done' }));
      }
    } catch (err) {
      console.error('WS handler error:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Analysis failed' }));
    }
  })

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log('WebSocket server running on ws://localhost:3001');