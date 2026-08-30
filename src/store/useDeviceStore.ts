import { create } from 'zustand';
import packageJson from '../../package.json';

export interface DeviceInfo {
  platform: string;
  osPrettyName: string;
  appVersion: string;
  geo: { country: string; city: string } | null;
  loading: boolean;
  error: string | null;
}

interface DeviceStore extends DeviceInfo {
  setDeviceInfo: (info: Partial<DeviceInfo>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  platform: '',
  osPrettyName: '',
  appVersion: packageJson.version || '0.1.996',
  geo: null,
  loading: true,
  error: null,
  setDeviceInfo: (info) => set((state) => ({ ...state, ...info })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));