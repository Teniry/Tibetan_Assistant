export type DigitalHumanVoiceRole = 'middle-aged-man' | 'sunny-boy' | 'cheerful-girl';

interface VoiceProfile {
  role: DigitalHumanVoiceRole;
  preferredNames: string[];
  rate: number;
  pitch: number;
}

export interface StreamingSpeechController {
  push: (text: string) => void;
  finish: () => void;
  cancel: () => void;
}

interface SpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
}

export interface SpeechProfileOverrides {
  role?: DigitalHumanVoiceRole;
  voiceName?: string;
  rate?: number;
  pitch?: number;
}

const VOICE_PROFILES: Record<string, VoiceProfile> = {
  muxiaoce: {
    role: 'middle-aged-man',
    preferredNames: ['yunfeng', 'yunjian', 'yunyang', 'yunhao', 'kangkang', 'danny', 'male', 'man'],
    rate: 0.9,
    pitch: 0.78,
  },
  muxiaozhi: {
    role: 'sunny-boy',
    preferredNames: ['yunxi', 'yunxia', 'yunze', 'young', 'boy', 'male'],
    rate: 1.08,
    pitch: 1.15,
  },
  muxiaowen: {
    role: 'cheerful-girl',
    preferredNames: ['xiaoxiao', 'xiaoyi', 'huihui', 'yaoyao', 'female', 'woman'],
    rate: 1.04,
    pitch: 1.12,
  },
};

const FEMALE_HINTS = ['xiaoxiao', 'xiaoyi', 'huihui', 'yaoyao', 'female', 'woman', 'girl', 'tingting'];
const MALE_HINTS = ['yunxi', 'yunyang', 'yunfeng', 'yunjian', 'yunhao', 'yunze', 'kangkang', 'danny', 'male', 'man', 'boy'];
let activeSpeechGeneration = 0;

function profileFor(pointId: string): VoiceProfile {
  return VOICE_PROFILES[pointId] || VOICE_PROFILES.muxiaowen;
}

function resolvedProfile(pointId: string, overrides: SpeechProfileOverrides): VoiceProfile {
  const base = profileFor(pointId);
  return {
    ...base,
    role: overrides.role || base.role,
    rate: Number.isFinite(overrides.rate) ? Math.min(1.5, Math.max(0.6, Number(overrides.rate))) : base.rate,
    pitch: Number.isFinite(overrides.pitch) ? Math.min(1.5, Math.max(0.5, Number(overrides.pitch))) : base.pitch,
  };
}

function readableText(markdown: string): string {
  const lines = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\|?\s*[-:]{3,}/.test(line));

  return lines
    .map((line) => {
      if (line.startsWith('|') && line.endsWith('|')) {
        return line.split('|').map((cell) => cell.trim()).filter(Boolean).join('，');
      }
      return line;
    })
    .join('。')
    .replace(/\[(?:资料|来源)?\d+\]/g, '')
    .replace(/[*_#>`~]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/。{2,}/g, '。')
    .trim();
}

function includesAny(value: string, hints: string[]) {
  return hints.some((hint) => value.includes(hint));
}

function chooseVoice(
  voices: SpeechSynthesisVoice[],
  profile: VoiceProfile,
  requestedVoiceName?: string,
): SpeechSynthesisVoice | undefined {
  const exactVoice = requestedVoiceName
    ? voices.find((voice) => voice.name === requestedVoiceName || voice.voiceURI === requestedVoiceName)
    : undefined;
  if (exactVoice) return exactVoice;

  return voices
    .map((voice, index) => {
      const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
      const preferredIndex = profile.preferredNames.findIndex((keyword) => name.includes(keyword));
      let score = preferredIndex === -1 ? 0 : 500 - preferredIndex * 20;
      if (/^zh(?:-|_)/i.test(voice.lang)) score += 80;
      const soundsFemale = includesAny(name, FEMALE_HINTS);
      const soundsMale = includesAny(name, MALE_HINTS);
      if (profile.role === 'cheerful-girl') score += soundsFemale ? 220 : soundsMale ? -300 : 0;
      if (profile.role !== 'cheerful-girl') score += soundsMale ? 220 : soundsFemale ? -300 : 0;
      if (profile.role === 'sunny-boy' && includesAny(name, ['yunxi', 'young', 'boy'])) score += 45;
      if (profile.role === 'middle-aged-man' && includesAny(name, ['yunfeng', 'kangkang', 'danny'])) score += 45;
      return { voice, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.voice;
}

async function availableVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length > 0) return existing;

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(synth.getVoices()), 1000);
    const onChanged = () => {
      window.clearTimeout(timer);
      synth.removeEventListener('voiceschanged', onChanged);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', onChanged, { once: true });
  });
}

function speechSupported() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined';
}

function splitLongText(text: string, maximumLength = 120): string[] {
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maximumLength) {
    const candidate = remaining.slice(0, maximumLength);
    const breakAt = Math.max(candidate.lastIndexOf('，'), candidate.lastIndexOf(' '), Math.floor(maximumLength * 0.65));
    parts.push(remaining.slice(0, breakAt + 1).trim());
    remaining = remaining.slice(breakAt + 1).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export function stopSpeech(): void {
  activeSpeechGeneration += 1;
  if (speechSupported()) window.speechSynthesis.cancel();
}

export function createStreamingSpeaker(
  pointId: string,
  callbacks: SpeechCallbacks = {},
  overrides: SpeechProfileOverrides = {},
): StreamingSpeechController | null {
  if (!speechSupported()) {
    callbacks.onEnd?.();
    return null;
  }

  const synth = window.speechSynthesis;
  const profile = resolvedProfile(pointId, overrides);
  const generation = ++activeSpeechGeneration;
  const voicePromise = availableVoices().then((voices) => chooseVoice(voices, profile, overrides.voiceName));
  const queue: string[] = [];
  let rawBuffer = '';
  let utteranceActive = false;
  let finished = false;
  let started = false;
  let ended = false;

  synth.cancel();

  const endOnce = () => {
    if (ended) return;
    ended = true;
    callbacks.onEnd?.();
  };

  const pump = async () => {
    if (generation !== activeSpeechGeneration || utteranceActive) return;
    const next = queue.shift();
    if (!next) {
      if (finished) endOnce();
      return;
    }

    utteranceActive = true;
    const voice = await voicePromise;
    if (generation !== activeSpeechGeneration) return;
    const utterance = new SpeechSynthesisUtterance(next);
    utterance.lang = 'zh-CN';
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    utterance.volume = 1;
    utterance.voice = voice || null;
    utterance.onstart = () => {
      if (!started) {
        started = true;
        callbacks.onStart?.();
      }
    };
    const continueQueue = () => {
      if (generation !== activeSpeechGeneration) return;
      utteranceActive = false;
      void pump();
    };
    utterance.onend = continueQueue;
    utterance.onerror = continueQueue;
    synth.speak(utterance);
  };

  const enqueue = (text: string) => {
    const clean = readableText(text);
    if (!clean) return;
    queue.push(...splitLongText(clean));
    void pump();
  };

  const flushCompleteSentences = () => {
    let boundary = rawBuffer.search(/[。！？!?\n；;]/);
    while (boundary >= 0) {
      enqueue(rawBuffer.slice(0, boundary + 1));
      rawBuffer = rawBuffer.slice(boundary + 1);
      boundary = rawBuffer.search(/[。！？!?\n；;]/);
    }
    if (rawBuffer.length >= 140) {
      enqueue(rawBuffer.slice(0, 120));
      rawBuffer = rawBuffer.slice(120);
    }
  };

  return {
    push(text: string) {
      if (generation !== activeSpeechGeneration || finished) return;
      rawBuffer += text;
      flushCompleteSentences();
    },
    finish() {
      if (generation !== activeSpeechGeneration || finished) return;
      finished = true;
      enqueue(rawBuffer);
      rawBuffer = '';
      void pump();
    },
    cancel() {
      if (generation !== activeSpeechGeneration) return;
      activeSpeechGeneration += 1;
      synth.cancel();
      endOnce();
    },
  };
}

export async function speakAnswer(
  text: string,
  pointId: string,
  callbacks: SpeechCallbacks = {},
  overrides: SpeechProfileOverrides = {},
): Promise<boolean> {
  const content = readableText(text);
  if (!content || !speechSupported()) {
    callbacks.onEnd?.();
    return false;
  }
  const controller = createStreamingSpeaker(pointId, callbacks, overrides);
  if (!controller) return false;
  controller.push(content);
  controller.finish();
  return true;
}
