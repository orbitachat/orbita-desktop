import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Message } from '../../store/useChatStore';
import { useAudioStore } from '../../store/useAudioStore';
import { useDecryptedMedia } from '../../lib/media-utils';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { MD3CircularSpinner } from '../common/MD3CircularSpinner';
import { appVisibility } from '../../utils/appVisibility';
import { orbitFs } from './chatUtils';

export const formatVoiceTime = (seconds: number) => {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface VoiceMessagePlayerProps {
  url: string;
  fileName?: string;
  sharedSecret: string | undefined;
  mime?: string;
  chatId?: string;
  messageId?: string;
  msg?: Message;
  timeNode?: React.ReactNode;
  isOwn?: boolean;
  customRadius?: string;
}

export const VoiceMessagePlayer = memo(({
  url,
  fileName,
  sharedSecret,
  mime,
  chatId,
  messageId,
  msg,
  timeNode,
  isOwn = false,
  customRadius,
}: VoiceMessagePlayerProps) => {
  const { t } = useTranslation();
  const bubbleRadius = useChatStore((state) => state.bubbleRadius);

  const trackId = msg?.id || messageId || url;
  const isCurrentTrack = useAudioStore((state) => state.currentTrack?.id === trackId);
  const isGlobalPlaying = useAudioStore((state) => (isCurrentTrack ? state.isPlaying : false));
  const globalCurrentTime = useAudioStore((state) => (isCurrentTrack ? state.currentTime : 0));
  const globalDuration = useAudioStore((state) => (isCurrentTrack ? state.duration : 0));

  const playTrack = useAudioStore((state) => state.play);
  const pauseTrack = useAudioStore((state) => state.pause);
  const seekTrack = useAudioStore((state) => state.seek);
  const setStoreDuration = useAudioStore((state) => state.setDuration);

  const [localDuration, setLocalDuration] = useState<number>(msg?.duration || 0);
  const [isDragging, setIsDragging] = useState(false);

  const waveformRef = useRef<HTMLDivElement>(null);
  const progressOverlayRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const { blobUrl } = useDecryptedMedia(url, sharedSecret, fileName, mime, chatId, messageId);

  useEffect(() => {
    if (!blobUrl || (localDuration > 0 && isFinite(localDuration))) return;
    let isMounted = true;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = blobUrl;
    audio.onloadedmetadata = () => {
      if (isMounted && audio.duration && isFinite(audio.duration)) {
        setLocalDuration(audio.duration);
        if (isCurrentTrack && (!globalDuration || globalDuration === 0)) {
          setStoreDuration(audio.duration);
        }
      }
    };
    return () => {
      isMounted = false;
      audio.src = '';
    };
  }, [blobUrl, localDuration, isCurrentTrack, globalDuration, setStoreDuration]);

  useEffect(() => {
    if (msg?.duration && msg.duration > 0 && (!localDuration || localDuration === 0)) {
      setLocalDuration(msg.duration);
    }
  }, [msg?.duration, localDuration]);

  useEffect(() => {
    if (isCurrentTrack && localDuration > 0 && (!globalDuration || globalDuration === 0)) {
      setStoreDuration(localDuration);
    } else if (isCurrentTrack && globalDuration > 0 && Math.abs(localDuration - globalDuration) > 0.05) {
      setLocalDuration(globalDuration);
    }
  }, [isCurrentTrack, localDuration, globalDuration, setStoreDuration]);

  const effectiveDuration = isCurrentTrack && globalDuration > 0 ? globalDuration : localDuration;
  const effectiveCurrentTime = isCurrentTrack ? globalCurrentTime : 0;
  const isPlaying = isCurrentTrack && isGlobalPlaying;

  const handlePlayToggle = () => {
    if (isCurrentTrack) {
      if (isPlaying) {
        pauseTrack();
      } else {
        playTrack();
      }
    } else if (blobUrl) {
      const voiceTitle = t('chatWindow.voice_message');
      const voiceArtist = msg?.sender || '';
      playTrack({
        id: trackId,
        chatId: chatId || msg?.id || '',
        title: voiceTitle,
        artist: voiceArtist,
        duration: effectiveDuration,
        cover: null,
        url,
        sharedSecret: sharedSecret || '',
        mediaType: 'voice',
        message: msg,
      });
    }
  };

  const BAR_COUNT = 66;
  const bars = useMemo(() => {
    if (msg?.waveform && msg.waveform.length > 0) {
      const src = msg.waveform;
      const step = src.length / BAR_COUNT;
      const res: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.min(src.length - 1, Math.floor(i * step));
        res.push(src[idx]);
      }
      return res;
    }
    const seed = (trackId || 'voice').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const val = Math.sin(seed + i * 0.7) * 40 + Math.cos(seed * 0.3 + i * 1.2) * 30 + 45;
      return Math.max(12, Math.min(100, Math.round(val)));
    });
  }, [msg?.waveform, trackId]);

  const [dragProgressRatio, setDragProgressRatio] = useState<number | null>(null);
  const dragStateRef = useRef<{ isDragging: boolean; targetTime: number; ratio: number }>({
    isDragging: false,
    targetTime: 0,
    ratio: 0,
  });
  const rafIdRef = useRef<number | null>(null);

  const updateSeekVisual = useCallback((clientX: number) => {
    if (!waveformRef.current || !effectiveDuration || effectiveDuration <= 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = offsetX / rect.width;
    const newTime = ratio * effectiveDuration;

    dragStateRef.current.ratio = ratio;
    dragStateRef.current.targetTime = newTime;

    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      setDragProgressRatio(ratio);
      if (progressOverlayRef.current) {
        progressOverlayRef.current.style.width = `${ratio * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatVoiceTime(newTime)} / ${formatVoiceTime(effectiveDuration)}`;
      }
    });
  }, [effectiveDuration]);

  const commitSeek = useCallback(() => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
    setDragProgressRatio(null);
    const newTime = dragStateRef.current.targetTime;

    if (isCurrentTrack) {
      seekTrack(newTime);
    } else {
      const voiceTitle = t('chatWindow.voice_message');
      const voiceArtist = msg?.sender || '';
      playTrack({
        id: trackId,
        chatId: chatId || msg?.id || '',
        title: voiceTitle,
        artist: voiceArtist,
        duration: effectiveDuration,
        cover: null,
        url,
        sharedSecret: sharedSecret || '',
        message: msg,
      });
      setTimeout(() => seekTrack(newTime), 50);
    }
  }, [effectiveDuration, isCurrentTrack, seekTrack, playTrack, trackId, chatId, msg, t, url, sharedSecret]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    dragStateRef.current.isDragging = true;
    setIsDragging(true);
    updateSeekVisual(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) return;
      updateSeekVisual(e.clientX);
    };
    const handleMouseUp = () => commitSeek();
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateSeekVisual, commitSeek]);

  useEffect(() => {
    let animId: number;
    let lastAudioTime = 0;
    let lastSyncTime = performance.now();

    const tick = () => {
      if (dragStateRef.current.isDragging) return;

      const getLiveTime = useAudioStore.getState().getLiveTime;
      const liveAudioTime = isCurrentTrack
        ? (getLiveTime ? getLiveTime() : useAudioStore.getState().currentTime)
        : 0;
      const now = performance.now();

      let currentExactTime = liveAudioTime;
      const playbackRate = useAudioStore.getState().playbackRate || 1;
      if (isPlaying && playbackRate > 0) {
        let expectedTime = ((now - lastSyncTime) / 1000) * playbackRate;
        if (Math.abs(liveAudioTime - expectedTime) > 0.3 || liveAudioTime < 0.1) {
          lastSyncTime = now - (liveAudioTime * 1000) / playbackRate;
          expectedTime = liveAudioTime;
        }
        currentExactTime = Math.min(effectiveDuration, expectedTime);
      }

      if (liveAudioTime !== lastAudioTime) {
        lastAudioTime = liveAudioTime;
      }

      let ratio = effectiveDuration > 0 ? Math.min(1, currentExactTime / effectiveDuration) : 0;
      if (effectiveDuration > 0 && currentExactTime >= effectiveDuration - 0.4) {
        ratio = 1;
      }
      if (progressOverlayRef.current) {
        progressOverlayRef.current.style.width = `${ratio * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatVoiceTime(currentExactTime)} / ${formatVoiceTime(effectiveDuration)}`;
      }

      if (isPlaying && appVisibility.getIsVisible()) {
        animId = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      if (appVisibility.getIsVisible()) {
        animId = requestAnimationFrame(tick);
      } else {
        tick();
      }
    } else {
      let ratio = dragProgressRatio !== null
        ? dragProgressRatio
        : (effectiveDuration > 0 ? Math.min(1, effectiveCurrentTime / effectiveDuration) : 0);
      if (effectiveDuration > 0 && effectiveCurrentTime >= effectiveDuration - 0.4) {
        ratio = 1;
      }
      if (progressOverlayRef.current) {
        progressOverlayRef.current.style.width = `${ratio * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = isPlaying || effectiveCurrentTime > 0
          ? `${formatVoiceTime(effectiveCurrentTime)} / ${formatVoiceTime(effectiveDuration)}`
          : formatVoiceTime(effectiveDuration);
      }
    }

    const unsubVisibility = appVisibility.subscribe((visible) => {
      cancelAnimationFrame(animId);
      if (visible) {
        lastSyncTime = performance.now();
        tick();
      }
    });

    return () => {
      cancelAnimationFrame(animId);
      unsubVisibility();
    };
  }, [isPlaying, isCurrentTrack, effectiveDuration, dragProgressRatio]);

  if (!blobUrl) {
    return (
      <div
        className="inline-flex items-center gap-2 select-none"
        style={{
          background: isOwn
            ? 'var(--chat-bubble-own-bg, #2c6bed)'
            : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
          padding: '8px 12px 8px 8px',
          border: 'none',
          borderRadius: customRadius || bubbleRadius,
          width: '280px',
          height: '64px',
          boxSizing: 'border-box',
        }}
      >
        <MD3CircularSpinner size="small" color={isOwn ? '#ffffff' : 'var(--accent-color, #7C3AED)'} />
        <span style={{ fontSize: orbitFs(10), color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)' }}>{t('chatWindow.loading')}</span>
      </div>
    );
  }

  const progressRatio = dragProgressRatio !== null ? dragProgressRatio : (effectiveDuration > 0 ? Math.min(1, effectiveCurrentTime / effectiveDuration) : 0);
  const displayCurrentTime = dragProgressRatio !== null ? dragProgressRatio * effectiveDuration : effectiveCurrentTime;

  return (
    <div
      className="flex items-center gap-2.5 select-none flex-shrink-0"
      style={{
        background: isOwn
          ? 'var(--chat-bubble-own-bg, #2c6bed)'
          : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
        padding: '8px 12px 8px 8px',
        border: 'none',
        borderRadius: customRadius || bubbleRadius,
        width: '280px',
        height: '64px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <AudioCoverWithPlay
        cover={null}
        isPlayingTrack={isPlaying}
        size={48}
        onClick={handlePlayToggle}
        isOwn={isOwn}
      />

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <div
          ref={waveformRef}
          onMouseDown={handleMouseDown}
          className="relative flex items-center cursor-pointer select-none"
          style={{ height: '22px', gap: '1px', width: 'max-content', userSelect: 'none' }}
        >
          {bars.map((h, idx) => {
            const barHeight = Math.max(3, Math.round((h / 100) * 20));
            return (
              <div
                key={idx}
                style={{
                  width: '2px',
                  minWidth: '2px',
                  maxWidth: '2px',
                  height: `${barHeight}px`,
                  flexShrink: 0,
                  backgroundColor: isOwn
                    ? 'rgba(255, 255, 255, 0.4)'
                    : 'color-mix(in srgb, var(--text-main) 30%, transparent)',
                  borderRadius: '1px',
                  transform: 'translateZ(0)',
                }}
              />
            );
          })}

          <div
            ref={progressOverlayRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${progressRatio * 100}%`,
              overflow: 'hidden',
              pointerEvents: 'none',
              willChange: 'width',
              transform: 'translateZ(0)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '22px',
                gap: '1px',
                width: 'max-content',
              }}
            >
              {bars.map((h, idx) => {
                const barHeight = Math.max(3, Math.round((h / 100) * 20));
                return (
                  <div
                    key={idx}
                    style={{
                      width: '2px',
                      minWidth: '2px',
                      maxWidth: '2px',
                      height: `${barHeight}px`,
                      flexShrink: 0,
                      backgroundColor: isOwn
                        ? '#ffffff'
                        : 'var(--accent-color, #7C3AED)',
                      borderRadius: '1px',
                      transform: 'translateZ(0)',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between" style={{ fontSize: '10.5px', color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)', marginTop: '1px' }}>
          <span ref={timeDisplayRef} className="tabular-nums">
            {isPlaying || displayCurrentTime > 0
              ? `${formatVoiceTime(displayCurrentTime)} / ${formatVoiceTime(effectiveDuration)}`
              : formatVoiceTime(effectiveDuration)}
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: isOwn ? '2px' : '5px',
          right: isOwn ? '3px' : '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          pointerEvents: 'none',
          userSelect: 'none',
          lineHeight: 1,
        }}
      >
        {timeNode}
      </div>
    </div>
  );
});
