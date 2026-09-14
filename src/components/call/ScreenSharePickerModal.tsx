import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Monitor, AppWindow, Volume2, RefreshCw, X } from 'lucide-react';
import { useCallStore } from '../../store/useCallStore';

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
  display_id?: string;
}

export interface ScreenShareOptions {
  sourceId?: string;
  quality: '240p' | '360p' | '720p' | '1080p';
  fps: 15 | 30 | 45 | 60;
  audio: boolean;
}

interface ScreenSharePickerModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onStart?: (options: ScreenShareOptions) => void;
}

export const ScreenSharePickerModal: React.FC<ScreenSharePickerModalProps> = ({
  isOpen,
  onClose,
  onStart,
}) => {
  const { t } = useTranslation();
  const storeIsOpen = useCallStore((s) => s.isScreenPickerOpen);
  const storeClose = useCallStore((s) => s.closeScreenPicker);
  const storeStart = useCallStore((s) => s.startScreenShareWithOptions);

  const effectiveIsOpen = isOpen !== undefined ? isOpen : storeIsOpen;
  const handleClose = onClose || storeClose;
  const handleStartShare = onStart || storeStart;

  const [activeTab, setActiveTab] = useState<'screens' | 'windows'>('screens');
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [quality, setQuality] = useState<'240p' | '360p' | '720p'>('720p');
  const [fps, setFps] = useState<15 | 30 | 45>(45);
  const [shareAudio, setShareAudio] = useState<boolean>(false);

  const fetchSources = useCallback(async () => {
    const orbita = (window as any).orbita;
    if (!orbita?.getDesktopSources) {
      setSources([]);
      return;
    }
    setIsLoading(true);
    try {
      const list: DesktopSource[] = await orbita.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailWidth: 360,
        thumbnailHeight: 202,
        fetchWindowIcons: true,
      });
      setSources(list || []);
      if (list && list.length > 0) {
        const screens = list.filter((s) => s.id.startsWith('screen:'));
        const windows = list.filter((s) => s.id.startsWith('window:'));
        if (activeTab === 'screens' && screens.length > 0) {
          setSelectedSourceId(screens[0].id);
        } else if (activeTab === 'windows' && windows.length > 0) {
          setSelectedSourceId(windows[0].id);
        } else {
          setSelectedSourceId(list[0].id);
        }
      }
    } catch {
      setSources([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (effectiveIsOpen) {
      fetchSources();
    } else {
      setSelectedSourceId(null);
    }
  }, [effectiveIsOpen, fetchSources]);

  useEffect(() => {
    if (sources.length === 0) return;
    const currentList =
      activeTab === 'screens'
        ? sources.filter((s) => s.id.startsWith('screen:'))
        : sources.filter((s) => s.id.startsWith('window:'));
    if (currentList.length > 0) {
      setSelectedSourceId(currentList[0].id);
    } else {
      setSelectedSourceId(null);
    }
  }, [activeTab, sources]);

  const handleStart = () => {
    handleStartShare({
      sourceId: selectedSourceId || undefined,
      quality,
      fps,
      audio: shareAudio,
    });
    handleClose();
  };

  if (!effectiveIsOpen) return null;

  const screens = sources.filter((s) => s.id.startsWith('screen:'));
  const windows = sources.filter((s) => s.id.startsWith('window:'));
  const currentItems = activeTab === 'screens' ? screens : windows;
  const isElectron = !!(window as any).orbita?.getDesktopSources;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[700] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
        }}
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full max-w-[640px] rounded-[16px] shadow-2xl flex flex-col overflow-hidden"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 97%, #000)',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
            maxHeight: '90vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div>
              <h2 className="text-[17px] font-semibold text-[var(--text-main,#ffffff)] tracking-tight m-0">
                {t('call.screen_share_modal_title')}
              </h2>
              <p className="text-[13px] text-[var(--text-dim,#8a96a3)] mt-0.5 mb-0">
                {t('call.screen_share_modal_hint')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {isElectron && (
                <button
                  type="button"
                  onClick={fetchSources}
                  aria-label={t('common.refresh', 'Обновить')}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-dim,#8a96a3)] hover:text-[var(--text-main,#ffffff)] hover:bg-[var(--surface-container-hover,rgba(255,255,255,0.06))] transition-colors border-0 bg-transparent cursor-pointer outline-none"
                >
                  <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                aria-label={t('common.close', 'Закрыть')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-dim,#8a96a3)] hover:text-[var(--text-main,#ffffff)] hover:bg-[var(--surface-container-hover,rgba(255,255,255,0.06))] transition-colors border-0 bg-transparent cursor-pointer outline-none"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {isElectron && (
            <div className="flex items-center gap-2 px-6 border-b border-[var(--border-subtle,rgba(255,255,255,0.08))]">
              <button
                type="button"
                onClick={() => setActiveTab('screens')}
                aria-label={t('call.screens')}
                className="flex items-center gap-2 py-2.5 px-3 text-[13px] font-medium border-0 bg-transparent cursor-pointer relative transition-colors outline-none"
                style={{
                  color: activeTab === 'screens' ? 'var(--accent-color, #7C3AED)' : 'var(--text-dim, #8a96a3)',
                }}
              >
                <Monitor size={16} />
                <span>{t('call.screens')}</span>
                {screens.length > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--surface-container,rgba(255,255,255,0.08))] text-[var(--text-dim)]">
                    {screens.length}
                  </span>
                )}
                {activeTab === 'screens' && (
                  <motion.div
                    layoutId="active-tab-line"
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                    style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('windows')}
                aria-label={t('call.applications')}
                className="flex items-center gap-2 py-2.5 px-3 text-[13px] font-medium border-0 bg-transparent cursor-pointer relative transition-colors outline-none"
                style={{
                  color: activeTab === 'windows' ? 'var(--accent-color, #7C3AED)' : 'var(--text-dim, #8a96a3)',
                }}
              >
                <AppWindow size={16} />
                <span>{t('call.applications')}</span>
                {windows.length > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--surface-container,rgba(255,255,255,0.08))] text-[var(--text-dim)]">
                    {windows.length}
                  </span>
                )}
                {activeTab === 'windows' && (
                  <motion.div
                    layoutId="active-tab-line"
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                    style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
                  />
                )}
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-4 max-h-[360px]">
            {isElectron ? (
              isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-dim,#8a96a3)]">
                  <RefreshCw size={24} className="animate-spin text-[var(--accent-color,#7C3AED)]" />
                  <span className="text-[13px]">{t('call.loading_sources')}</span>
                </div>
              ) : currentItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim,#8a96a3)] text-[13px]">
                  {t('call.no_sources_found')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3.5">
                  {currentItems.map((item) => {
                    const isSelected = selectedSourceId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedSourceId(item.id)}
                        onDoubleClick={handleStart}
                        className="group relative flex flex-col rounded-[12px] p-2.5 transition-all cursor-pointer overflow-hidden"
                        style={{
                          backgroundColor: isSelected
                            ? 'color-mix(in srgb, var(--accent-color, #7C3AED) 14%, var(--surface-container, rgba(255,255,255,0.05)))'
                            : 'var(--surface-container, rgba(255, 255, 255, 0.04))',
                          border: isSelected
                            ? '1.5px solid var(--accent-color, #7C3AED)'
                            : '1.5px solid transparent',
                        }}
                      >
                        <div className="relative w-full aspect-video rounded-[8px] overflow-hidden bg-black/40 flex items-center justify-center">
                          {item.thumbnail ? (
                            <img
                              src={item.thumbnail}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Monitor size={36} className="text-white/30" />
                          )}
                          {isSelected && (
                            <div
                              className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center shadow"
                              style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-2 px-1">
                          {item.appIcon ? (
                            <img src={item.appIcon} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
                          ) : (
                            <Monitor size={14} className="text-[var(--text-dim,#8a96a3)] flex-shrink-0" />
                          )}
                          <span
                            className="text-[13px] font-medium truncate"
                            style={{
                              color: isSelected ? 'var(--text-main, #ffffff)' : 'var(--text-dim, #8a96a3)',
                            }}
                          >
                            {item.name}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-[var(--text-dim,#8a96a3)]">
                <Monitor size={48} className="text-[var(--accent-color,#7C3AED)] mb-3" />
                <p className="text-[14px] text-[var(--text-main,#ffffff)] font-medium m-0">
                  {t('call.screen_share_modal_hint')}
                </p>
              </div>
            )}
          </div>

          <div
            className="px-6 py-3.5 border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] flex flex-col gap-3"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 92%, #000)',
            }}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[var(--text-dim,#8a96a3)]">
                    {t('call.quality')}:
                  </span>
                  <div className="flex items-center rounded-lg p-0.5 bg-[var(--surface-container,rgba(255,255,255,0.06))]">
                    {(['240p', '360p', '720p'] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuality(q)}
                        aria-label={q}
                        className="px-2.5 py-1 text-[12px] font-medium rounded-md border-0 cursor-pointer transition-all"
                        style={{
                          backgroundColor: quality === q ? 'var(--accent-color, #7C3AED)' : 'transparent',
                          color: quality === q ? '#ffffff' : 'var(--text-dim, #8a96a3)',
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[var(--text-dim,#8a96a3)]">
                    {t('call.framerate')}:
                  </span>
                  <div className="flex items-center rounded-lg p-0.5 bg-[var(--surface-container,rgba(255,255,255,0.06))]">
                    {([15, 30, 45] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setFps(rate)}
                        aria-label={`${rate} FPS`}
                        className="px-2.5 py-1 text-[12px] font-medium rounded-md border-0 cursor-pointer transition-all"
                        style={{
                          backgroundColor: fps === rate ? 'var(--accent-color, #7C3AED)' : 'transparent',
                          color: fps === rate ? '#ffffff' : 'var(--text-dim, #8a96a3)',
                        }}
                      >
                        {rate} FPS
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div
                onClick={() => setShareAudio(!shareAudio)}
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <Volume2 size={16} className={shareAudio ? 'text-[var(--accent-color,#7C3AED)]' : 'text-[var(--text-dim,#8a96a3)]'} />
                <span className="text-[12px] font-medium text-[var(--text-main,#ffffff)]">
                  {t('call.share_audio')}
                </span>
                <div
                  className="w-8 h-4 rounded-full transition-colors relative flex items-center px-0.5 ml-1"
                  style={{
                    backgroundColor: shareAudio ? 'var(--accent-color, #7C3AED)' : 'var(--surface-container-strong, rgba(255,255,255,0.2))',
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full bg-white transition-transform"
                    style={{
                      transform: shareAudio ? 'translateX(16px)' : 'translateX(0px)',
                    }}
                  />
                </div>
              </div>
            </div>

            {shareAudio && (
              <div className="w-full text-[11.5px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg select-none">
                {t('call.share_audio_echo_warning')}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                aria-label={t('common.cancel', 'Отмена')}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-main,#ffffff)] hover:bg-[var(--surface-container-hover,rgba(255,255,255,0.06))] transition-colors border-0 bg-transparent cursor-pointer"
              >
                {t('common.cancel', 'Отмена')}
              </button>

              <button
                type="button"
                onClick={handleStart}
                aria-label={t('call.go_live')}
                className="px-5 py-2 rounded-lg text-[13px] font-medium text-white shadow-lg cursor-pointer transition-transform active:scale-95 border-0"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-color, #7C3AED), var(--accent-dark, #5B21B6))',
                }}
              >
                {t('call.go_live')}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
