import { useEffect, useState } from 'react';

export function useWebSocket(url: string) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<'Connected' | 'Disconnected'>('Disconnected');
  const [responseText, setResponseText] = useState<string>('');

  // Manage WS lifecycle
  useEffect(() => {
    const socket = new WebSocket(url);

    socket.onopen = () => {
      console.log('Connected');
      setWs(socket);
      setStatus('Connected');
    }

    socket.onmessage = (e) => {
      console.log(`Message: ${e.data}`);
      setResponseText(e.data);
    }

    socket.onclose = () => {
      console.log('Disconnected');
      setStatus('Disconnected');
    }

    // Cleanup on unmount
    return () => {
      socket.close();
    }
  }, [url]); // WS reconnects if URL changes

  const send = (msg: string) => {
    if (ws && status === 'Connected') {
      ws.send(msg);
    }
  }

  return { send, status, responseText };
};