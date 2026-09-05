import { create } from 'zustand';

export type DevicePermissionType = 'camera' | 'microphone';

interface DevicePermissionState {
  isModalOpen: boolean;
  permissionType: DevicePermissionType | null;
  hasCameraPermission: boolean;
  hasMicrophonePermission: boolean;
  pendingResolve: ((granted: boolean) => void) | null;
  requestPermission: (type: DevicePermissionType) => Promise<boolean>;
  confirmPermission: () => void;
  denyPermission: () => void;
  resetPermissions: () => void;
}

const getStoredPermission = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === 'granted';
  } catch {
    return false;
  }
};

export const useDevicePermissionStore = create<DevicePermissionState>((set, get) => ({
  isModalOpen: false,
  permissionType: null,
  hasCameraPermission: getStoredPermission('orbita_perm_camera'),
  hasMicrophonePermission: getStoredPermission('orbita_perm_microphone'),
  pendingResolve: null,

  requestPermission: (type: DevicePermissionType): Promise<boolean> => {
    const state = get();
    if (type === 'camera' && state.hasCameraPermission) {
      return Promise.resolve(true);
    }
    if (type === 'microphone' && state.hasMicrophonePermission) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      set({
        isModalOpen: true,
        permissionType: type,
        pendingResolve: resolve,
      });
    });
  },

  confirmPermission: () => {
    const { permissionType, pendingResolve } = get();
    if (permissionType === 'camera') {
      try {
        localStorage.setItem('orbita_perm_camera', 'granted');
      } catch {}
      set({ hasCameraPermission: true, isModalOpen: false, permissionType: null, pendingResolve: null });
    } else if (permissionType === 'microphone') {
      try {
        localStorage.setItem('orbita_perm_microphone', 'granted');
      } catch {}
      set({ hasMicrophonePermission: true, isModalOpen: false, permissionType: null, pendingResolve: null });
    }
    if (pendingResolve) {
      pendingResolve(true);
    }
  },

  denyPermission: () => {
    const { pendingResolve } = get();
    set({ isModalOpen: false, permissionType: null, pendingResolve: null });
    if (pendingResolve) {
      pendingResolve(false);
    }
  },

  resetPermissions: () => {
    try {
      localStorage.removeItem('orbita_perm_camera');
      localStorage.removeItem('orbita_perm_microphone');
    } catch {}
    set({ hasCameraPermission: false, hasMicrophonePermission: false });
  },
}));
