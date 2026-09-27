import { create } from 'zustand';

interface ToastState {
  isOpen: boolean;
  message: string;
  type?: 'developer' | 'image' | 'text';
  devNickname?: string;
  toastId: number;
  showToast: (message: string, type?: 'developer' | 'image' | 'text', devNickname?: string) => void;
  showDevToast: (nickname?: string) => void;
  hideToast: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  isOpen: false,
  message: '',
  type: 'text',
  devNickname: undefined,
  toastId: 0,

  showToast: (message: string, type: 'developer' | 'image' | 'text' = 'text', devNickname?: string) => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    const newId = Date.now();
    set({
      isOpen: true,
      message,
      type,
      devNickname,
      toastId: newId,
    });
    toastTimer = setTimeout(() => {
      set({ isOpen: false });
      toastTimer = null;
    }, 2000);
  },

  showDevToast: (nickname?: string) => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    const newId = Date.now();
    set({
      isOpen: true,
      message: '',
      type: 'developer',
      devNickname: nickname,
      toastId: newId,
    });
    toastTimer = setTimeout(() => {
      set({ isOpen: false });
      toastTimer = null;
    }, 2000);
  },

  hideToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ isOpen: false });
  },
}));
