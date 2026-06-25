import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import ChatThread, { ChatMessage } from '../components/ChatThread';

// KAN-39 — Slack-style threaded butler chat
// KAN-55 — long-thread message ordering bug, see services/concierge-chat/src/threads.ts

const WSS_URL = 'wss://api.sindalah/butler';

export default function ButlerChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(WSS_URL);

    socket.onmessage = ev => {
      const payload = JSON.parse(ev.data) as ChatMessage;
      setMessages(prev => mergeBySeq(prev, payload));
    };

    setWs(socket);
    return () => socket.close();
  }, []);

  const send = () => {
    if (!ws || !draft.trim()) return;
    ws.send(JSON.stringify({ type: 'guest.message', body: draft, ts: Date.now() }));
    setDraft('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ChatThread messages={messages} />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          placeholder="Message your butler"
          placeholderTextColor="#7E94A8"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

// Client-side merge by monotonic seq from the server.
// IMPORTANT: do NOT sort by client-arrival time — see KAN-55.
function mergeBySeq(prev: ChatMessage[], next: ChatMessage): ChatMessage[] {
  if (prev.some(m => m.id === next.id)) return prev;
  const merged = [...prev, next];
  merged.sort((a, b) => a.seq - b.seq);
  return merged;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1F33' },
  composer: { padding: 8, borderTopColor: '#13314F', borderTopWidth: 1 },
  input: {
    backgroundColor: '#13314F',
    color: '#F4E9D2',
    padding: 12,
    borderRadius: 10,
  },
});
