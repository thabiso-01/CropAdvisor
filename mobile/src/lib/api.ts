import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type Issue = {
  name: string;
  type: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
  evidence?: string;
};

export type FertilizerPlan = {
  crop: string;
  stage: string;
  recommended: string;
  npk: { n: number; p: number; k: number };
  application: string;
  timing: string;
  note?: string | null;
  adjustments: string[];
  schedule: { stage: string; product: string; npk: string; timing: string }[];
  safety: string;
};

export type AnalysisResult = {
  is_plant: boolean;
  crop: string;
  crop_confidence?: number;
  health_status: 'healthy' | 'mild' | 'moderate' | 'severe';
  health_score: number;
  summary: string;
  growth_stage: string;
  issues: Issue[];
  treatment: { title: string; description: string }[];
  prevention: string[];
  watering: { frequency: string; amount: string; advice: string };
  harvest: { ready: boolean; readiness_percent: number; estimated_days: string; signs?: string; advice: string };
  market: { quality_grade: string; advice: string };
  yield_tips: string[];
  follow_up_questions?: string[];
  fertilizer: FertilizerPlan;
  colour_stats?: Record<string, number>;
  sources?: { id: string; title: string }[];
};

export type AnalysisSummary = {
  id: string;
  created_at: string;
  crop: string;
  image_url: string;
  notes?: string | null;
  health_score: number;
  health_status: AnalysisResult['health_status'];
  favorite: boolean;
  provider: string;
  summary: string;
  top_issue?: string | null;
  harvest_ready: boolean;
};

export type Analysis = AnalysisSummary & { result: AnalysisResult };

export type Guide = { id: string; title: string; crop: string; category: string; content?: string; tags?: string[] };

export type Stats = {
  total: number;
  healthy: number;
  with_issues: number;
  favorites: number;
  avg_health: number;
  ready_to_harvest: number;
  by_crop: { crop: string; count: number }[];
  by_status: { status: string; count: number }[];
  top_issues: { name: string; count: number }[];
  trend: { date: string; score: number; crop: string }[];
};

export type ChatMsg = { role: 'user' | 'assistant'; content: string };

/** Resolve the backend URL: env var > Expo dev host (same LAN IP, port 8000) > localhost. */
function resolveBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:8000`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

export const API_URL = resolveBaseUrl();
export const imageUrl = (path: string) => (path.startsWith('http') ? path : `${API_URL}${path}`);

let deviceId = 'anonymous';
export const setDeviceId = (id: string) => {
  deviceId = id;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Device-Id': deviceId, ...(init.headers as Record<string, string>) };
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error(`Can't reach the Crop Advisor server at ${API_URL}. Check that it's running and your phone is on the same network.`);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  async analyze(uri: string, opts: { crop?: string; notes?: string; lang: string }) {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      form.append('image', blob, 'plant.jpg');
    } else {
      form.append('image', { uri, name: 'plant.jpg', type: 'image/jpeg' } as unknown as Blob);
    }
    if (opts.crop) form.append('crop', opts.crop);
    if (opts.notes) form.append('notes', opts.notes);
    form.append('lang', opts.lang);
    return request<Analysis>('/api/analyze', { method: 'POST', body: form });
  },
  list: (favorite?: boolean) => request<AnalysisSummary[]>(`/api/analyses${favorite === undefined ? '' : `?favorite=${favorite}`}`),
  get: (id: string) => request<Analysis>(`/api/analyses/${id}`),
  setFavorite: (id: string, favorite: boolean) =>
    request<AnalysisSummary>(`/api/analyses/${id}/favorite`, { method: 'PATCH', body: JSON.stringify({ favorite }) }),
  remove: (id: string) => request<void>(`/api/analyses/${id}`, { method: 'DELETE' }),
  chat: (body: { messages: ChatMsg[]; analysis_id?: string; image_base64?: string; lang: string }) =>
    request<{ reply: string; sources: { id: string; title: string }[]; provider: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  fertilizer: (body: { crop?: string; stage?: string; analysis_id?: string }) =>
    request<FertilizerPlan>('/api/fertilizer', { method: 'POST', body: JSON.stringify(body) }),
  guides: () => request<Guide[]>('/api/guides'),
  guide: (id: string) => request<Guide>(`/api/guides/${id}`),
  stats: () => request<Stats>('/api/stats'),
  health: () => request<{ status: string; provider: string }>('/health'),
};
