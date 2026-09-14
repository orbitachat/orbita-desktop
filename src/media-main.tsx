import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { TelegramMediaViewer, MediaViewerItem } from './components/chat/TelegramMediaViewer';
import './App.css';
import './i18n';

export const MediaWindowView: React.FC = () => {
  const [payload, setPayload] = useState<{
    items: MediaViewerItem[];
    initialIndex?: number;
    sharedSecret?: string;
    chatId?: string;
  } | null>(null);

  useEffect(() => {
    const orbita = (window as any).orbita;

    const applyVars = (vars: Record<string, string>) => {
      Object.entries(vars).forEach(([k, v]) => {
        document.documentElement.style.setProperty(k, String(v));
      });
    };

    try {
      const savedThemeVars = localStorage.getItem('orbita_theme_vars');
      if (savedThemeVars) {
        applyVars(JSON.parse(savedThemeVars));
      }
      const savedFont = localStorage.getItem('orbita_font_family');
      if (savedFont) {
        document.body.style.fontFamily = savedFont;
      }
    } catch {}

    const unsubTheme = orbita?.onThemeChanged?.((data: any) => {
      if (data?.themeVars) {
        applyVars(data.themeVars);
      }
    });

    const unsubFont = orbita?.onFontChanged?.((font: string) => {
      if (font) {
        document.body.style.fontFamily = font;
      }
    });

    if (orbita?.getMediaPayload) {
      orbita.getMediaPayload().then((p: any) => {
        if (p) setPayload(p);
      });
    }

    let unsubPayload: (() => void) | undefined;
    if (orbita?.onMediaPayload) {
      unsubPayload = orbita.onMediaPayload((newPayload: any) => {
        setPayload(newPayload);
      });
    }

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('orbita-media-channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'SET_MEDIA_PAYLOAD') {
          setPayload(event.data.payload);
        }
      };
      bc.postMessage({ type: 'REQUEST_MEDIA_PAYLOAD' });
    } catch {}

    return () => {
      unsubTheme?.();
      unsubFont?.();
      unsubPayload?.();
      bc?.close();
    };
  }, []);

  const handleClose = () => {
    const orbita = (window as any).orbita;
    if (orbita?.closeMediaWindow) {
      orbita.closeMediaWindow();
    } else {
      window.close();
    }
  };

  const dispatchAction = (action: { type: string; messageId?: string; chatId?: string }) => {
    const orbita = (window as any).orbita;
    if (orbita?.sendMediaAction) {
      orbita.sendMediaAction(action);
    }
    try {
      const bc = new BroadcastChannel('orbita-media-action-channel');
      bc.postMessage(action);
      setTimeout(() => bc.close(), 300);
    } catch {}
    handleClose();
  };

  const handleGoToMessage = (messageId: string) => {
    dispatchAction({ type: 'GOTO_MESSAGE', messageId, chatId: payload?.chatId });
  };

  const handleForwardMessage = (messageId: string) => {
    dispatchAction({ type: 'FORWARD_MESSAGE', messageId, chatId: payload?.chatId });
  };

  const handleDeleteMessage = (messageId: string) => {
    dispatchAction({ type: 'DELETE_MESSAGE', messageId, chatId: payload?.chatId });
  };

  if (!payload || !payload.items || payload.items.length === 0) {
    return (
      <div className="w-full h-full min-h-screen bg-transparent flex items-center justify-center text-white/50 text-sm select-none">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen bg-transparent overflow-hidden select-none">
      <TelegramMediaViewer
        isOpen={true}
        items={payload.items}
        initialIndex={payload.initialIndex || 0}
        sharedSecret={payload.sharedSecret}
        onClose={handleClose}
        onGoToMessage={handleGoToMessage}
        onForwardMessage={handleForwardMessage}
        onDeleteMessage={handleDeleteMessage}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MediaWindowView />
  </React.StrictMode>
);
