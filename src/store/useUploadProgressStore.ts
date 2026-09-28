import { create } from 'zustand';

interface UploadProgressState {
  progressByKey: Record<string, number>;
  setProgress: (key: string, uploadedMb: number) => void;
  clearProgress: (key: string) => void;
  clearAll: () => void;
}

export const useUploadProgressStore = create<UploadProgressState>((set) => ({
  progressByKey: {},
  setProgress: (key, uploadedMb) =>
    set((state) => ({
      progressByKey: { ...state.progressByKey, [key]: uploadedMb },
    })),
  clearProgress: (key) =>
    set((state) => {
      if (!(key in state.progressByKey)) return state;
      const copy = { ...state.progressByKey };
      delete copy[key];
      return { progressByKey: copy };
    }),
  clearAll: () => set({ progressByKey: {} }),
}));
