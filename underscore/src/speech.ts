import Voice from '@react-native-voice/voice';
import { Platform } from 'react-native';

export type SpeechEvents = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
};

export function setupVoice(events: SpeechEvents) {
  Voice.onSpeechPartialResults = (e: any) => {
    const text = (e?.value?.[0] as string) || '';
    events.onPartial?.(text);
  };
  Voice.onSpeechResults = (e: any) => {
    const text = (e?.value?.[0] as string) || '';
    events.onFinal?.(text);
  };
  Voice.onSpeechError = (e: any) => {
    events.onError?.(String(e?.error?.message || e?.error || 'Unknown speech error'));
  };
}

export async function startListening() {
  const locale = Platform.select({ ios: 'en-US', android: 'en-US', default: 'en-US' });
  await Voice.start(locale!);
}

export async function stopListening() {
  try {
    await Voice.stop();
  } catch {}
}

export async function destroyListening() {
  try {
    await Voice.destroy();
  } catch {}
}


