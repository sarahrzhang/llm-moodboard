import { useEffect, useState, useRef } from 'react';

type ServerMessage =
  | { type: 'token'; data: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | string; // For backward compatibility with plain text messages

export function useWebSocket(url: string) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<'Connected' | 'Disconnected'>('Disconnected');
  const [responseText, setResponseText] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Use ref to accumulate tokens during streaming
  const accumulatedText = useRef<string>('');

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

      try {
        const message: ServerMessage = JSON.parse(e.data);

        if (typeof message === 'object' && 'type' in message) {
          if (message.type === 'token') {
            // Accumulate tokens as they arrive
            setIsStreaming(true);
            // accumulatedText.current += message.data;
            // setResponseText(accumulatedText.current);
            setResponseText(prev => prev + message.data);
          } else if (message.type === 'done') {
            setIsStreaming(false);
          } else if (message.type === 'error') {
            setIsStreaming(false);
            setResponseText(message.message);
          }
        } else {
          // Plain text message (backward compatibility)
          setResponseText(e.data);
        }
      } catch {
        // If JSON.parse fails, treat as plain text
        setResponseText(e.data);
      }
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

  const send = (msg: string | object) => {
    if (ws && status === 'Connected') {
      // Reset accumulated text when sending a new message
      accumulatedText.current = '';
      setResponseText('');

      const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
      ws.send(payload);
    }
  }

  // Handle JSON wrapping and state reset
  const startAnalysis = (prompt: string) => {
    setResponseText(''); // Clear previous
    send(JSON.stringify({ type: 'analyze', prompt }));
  };

  return { send, status, responseText, isStreaming, startAnalysis };
};