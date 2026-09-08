import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check, Trash2, RefreshCw, Database } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';
import { mediaManager } from '../../services/mediaManager';
import { BubbleSlider, M3Switch, MD3 } from '../chat/SettingsScreen';

interface DataMemorySettingsProps {
  cacheSizeLimit: number;
  mediaCacheLimit: number;
  cacheCleanupAge: number;
  autoLoadMedia: boolean;
  onCacheSizeLimitChange: (val: number) => Promise<void>;
  onMediaCacheLimitChange: (val: number) => Promise<void>;
  onCacheCleanupAgeChange: (val: number) => Promise<void>;
  onAutoLoadMediaChange: () => void;
}

interface ChatStorageItem {
  chatId: string;
  chatName: string;
  avatarUrl?: string;
  count: number;
  size: number;
}

const CATEGORY_CONFIGS = [
  { id: 'photos', color: '#8B5CF6', labelKey: 'settings.images_category' },
  { id: 'stickers', color: '#F97316', labelKey: 'settings.stickers_category' },
  { id: 'voice', color: '#10B981', labelKey: 'settings.voice_messages_category' },
  { id: 'videos', color: '#3B82F6', labelKey: 'settings.videos' },
  { id: 'other', color: '#A78BFA', labelKey: 'settings.other_category' },
] as const;

export const DataMemorySettings: React.FC<DataMemorySettingsProps> = ({
  cacheSizeLimit,
  mediaCacheLimit,
  cacheCleanupAge,
  autoLoadMedia,
  onCacheSizeLimitChange,
  onMediaCacheLimitChange,
  onCacheCleanupAgeChange,
  onAutoLoadMediaChange,
}) => {
  const { t } = useTranslation();
  const chats = useChatStore((s) => s.chats);

  const [cacheStats, setCacheStats] = useState<{
    totalCount: number;
    totalSize: number;
    byType: Record<string, { count: number; size: number }>;
  } | null>(null);

  const [chatStatsList, setChatStatsList] = useState<ChatStorageItem[]>([]);
  const [orphanStats, setOrphanStats] = useState<{ count: number; size: number }>({ count: 0, size: 0 });
  const [deviceDisk, setDeviceDisk] = useState<{ total: number; free: number; used: number } | null>(null);

  const [isClearing, setIsClearing] = useState(false);
  const [clearingChatId, setClearingChatId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const [selectedCategories, setSelectedCategories] = useState<Record<string, boolean>>({
    photos: true,
    stickers: true,
    voice: true,
    videos: true,
    other: true,
  });

  const formatBytes = useCallback((bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }, []);

  const totalDisplay = (v: number) => {
    if (v >= 1024) {
      return `${+(v / 1024).toFixed(1)} GB`;
    }
    return `${Math.round(v)} MB`;
  };

  const mediaDisplay = (v: number) => {
    if (v >= 1024) {
      return `${+(v / 1024).toFixed(1)} GB`;
    }
    return `${Math.round(v)} MB`;
  };

  const ageDisplay = (v: number) => {
    if (v === 0) return t('settings.never');
    const days = Math.round(v / (24 * 60 * 60 * 1000));
    if (days === 0) return t('settings.never');
    if (days === 7) return t('settings.one_week');
    if (days === 14) return t('settings.two_weeks');
    if (days === 30) return t('settings.one_month');
    if (days === 60) return t('settings.two_months');
    if (days === 90) return t('settings.three_months');
    return `${days} ${t('common.days')}`;
  };

  const loadStats = useCallback(async () => {
    if (typeof window === 'undefined' || !window.orbita?.mediaDetailedStats) return;
    try {
      const stats = await window.orbita.mediaDetailedStats();
      setCacheStats(stats);
    } catch {}
  }, []);

  const loadChatStats = useCallback(async () => {
    if (typeof window === 'undefined' || !window.orbita?.mediaChatStats) return;
    try {
      const rows = await window.orbita.mediaChatStats();
      let orphCount = 0;
      let orphBytes = 0;
      const items: ChatStorageItem[] = [];

      for (const r of rows) {
        if (!r.chat_id) {
          orphCount += r.count || 0;
          orphBytes += r.size || 0;
          continue;
        }
        const found = chats.find((c) => c.id === r.chat_id);
        items.push({
          chatId: r.chat_id,
          chatName: found?.name || `ID: ${r.chat_id.slice(0, 10)}`,
          avatarUrl: found?.avatarUrl,
          count: r.count || 0,
          size: r.size || 0,
        });
      }

      items.sort((a, b) => b.size - a.size);
      setChatStatsList(items);
      setOrphanStats({ count: orphCount, size: orphBytes });
    } catch {}
  }, [chats]);

  const loadDiskSpace = useCallback(async () => {
    if (typeof window === 'undefined' || !window.orbita?.getDiskSpace) return;
    try {
      const disk = await window.orbita.getDiskSpace();
      setDeviceDisk(disk);
    } catch {}
  }, []);

  useEffect(() => {
    loadStats();
    loadChatStats();
    loadDiskSpace();
  }, [loadStats, loadChatStats, loadDiskSpace]);

  const categoryStats = useMemo(() => {
    const result: Record<string, { count: number; size: number }> = {
      photos: { count: 0, size: 0 },
      stickers: { count: 0, size: 0 },
      voice: { count: 0, size: 0 },
      videos: { count: 0, size: 0 },
      other: { count: 0, size: 0 },
    };

    if (!cacheStats?.byType) return result;

    for (const [mime, data] of Object.entries(cacheStats.byType)) {
      const lower = mime.toLowerCase();
      if (lower.includes('gif') || lower.includes('sticker')) {
        result.stickers.count += data.count;
        result.stickers.size += data.size;
      } else if (lower.startsWith('image/')) {
        result.photos.count += data.count;
        result.photos.size += data.size;
      } else if (lower.startsWith('audio/') || lower.includes('opus') || lower.includes('ogg')) {
        result.voice.count += data.count;
        result.voice.size += data.size;
      } else if (lower.startsWith('video/')) {
        result.videos.count += data.count;
        result.videos.size += data.size;
      } else {
        result.other.count += data.count;
        result.other.size += data.size;
      }
    }

    return result;
  }, [cacheStats]);

  const totalSize = cacheStats?.totalSize || 0;

  const donutSlices = useMemo(() => {
    if (totalSize <= 0) return [];

    const C = 2 * Math.PI * 70;
    let accumulated = 0;

    return CATEGORY_CONFIGS.map((cfg) => {
      const size = categoryStats[cfg.id]?.size || 0;
      const percent = (size / totalSize) * 100;
      const length = (size / totalSize) * C;
      const offset = -accumulated;
      const midAngleDeg = ((accumulated + length / 2) / C) * 360 - 90;
      const midAngleRad = (midAngleDeg * Math.PI) / 180;
      const labelX = 100 + 70 * Math.cos(midAngleRad);
      const labelY = 100 + 70 * Math.sin(midAngleRad);

      accumulated += length;

      return {
        ...cfg,
        size,
        percent,
        length,
        offset,
        labelX,
        labelY,
        showLabel: percent >= 7,
      };
    }).filter((s) => s.size > 0);
  }, [totalSize, categoryStats]);

  const centerDisplay = useMemo(() => {
    if (totalSize <= 0) return { val: '0', unit: 'MB' };
    if (totalSize >= 1024 * 1024 * 1024) {
      return { val: (totalSize / (1024 * 1024 * 1024)).toFixed(1), unit: 'GB' };
    }
    if (totalSize >= 1024 * 1024) {
      const mb = totalSize / (1024 * 1024);
      return { val: mb >= 100 ? Math.round(mb).toString() : mb.toFixed(1), unit: 'MB' };
    }
    if (totalSize >= 1024) {
      return { val: Math.round(totalSize / 1024).toString(), unit: 'KB' };
    }
    return { val: totalSize.toString(), unit: 'B' };
  }, [totalSize]);

  const diskUsageText = useMemo(() => {
    if (deviceDisk && deviceDisk.total > 0 && totalSize > 0) {
      const percent = (totalSize / deviceDisk.total) * 100;
      if (percent < 1) {
        return t('settings.device_space_usage_less_1');
      }
      return t('settings.device_space_usage', { percent: `${percent.toFixed(1)}%` });
    }
    return t('settings.device_space_usage_less_1');
  }, [deviceDisk, totalSize, t]);

  const selectedSize = useMemo(() => {
    return CATEGORY_CONFIGS.reduce((acc, cfg) => {
      if (selectedCategories[cfg.id]) {
        return acc + (categoryStats[cfg.id]?.size || 0);
      }
      return acc;
    }, 0);
  }, [selectedCategories, categoryStats]);

  const allCategoriesSelected = useMemo(() => {
    return CATEGORY_CONFIGS.every((cfg) => selectedCategories[cfg.id]);
  }, [selectedCategories]);

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const showToast = (text: string) => {
    setFeedbackToast(text);
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleClearSelected = async () => {
    if (typeof window === 'undefined' || !window.orbita?.mediaClear) return;
    setIsClearing(true);
    try {
      const catsToClear = CATEGORY_CONFIGS.filter((cfg) => selectedCategories[cfg.id]).map((c) => c.id);
      await window.orbita.mediaClear(catsToClear);
      mediaManager.clearMemoryCache();
      await loadStats();
      await loadChatStats();
      showToast(t('settings.cache_cleared_success'));
    } catch {} finally {
      setIsClearing(false);
    }
  };

  const handleClearChatCache = async (chatId: string) => {
    setClearingChatId(chatId);
    try {
      if (window.orbita?.mediaDeleteByChatId) {
        await window.orbita.mediaDeleteByChatId(chatId);
      }
      await mediaManager.deleteByChatId(chatId);
      await loadStats();
      await loadChatStats();
      showToast(t('settings.cache_cleared_success'));
    } catch {} finally {
      setClearingChatId(null);
    }
  };

  const handleClearOrphanCache = async () => {
    setClearingChatId('orphan');
    try {
      if (window.orbita?.mediaDeleteByChatId) {
        await window.orbita.mediaDeleteByChatId('');
      }
      await loadStats();
      await loadChatStats();
      showToast(t('settings.cache_cleared_success'));
    } catch {} finally {
      setClearingChatId(null);
    }
  };

  const C = 2 * Math.PI * 70;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ padding: '0 0 36px', userSelect: 'none' }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 20px 8px',
        }}
      >
        <div style={{ position: 'relative', width: 200, height: 200 }}>
          <svg width={200} height={200} viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx={100}
              cy={100}
              r={70}
              fill="none"
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth={30}
            />

            {donutSlices.map((slice) => (
              <circle
                key={slice.id}
                cx={100}
                cy={100}
                r={70}
                fill="none"
                stroke={slice.color}
                strokeWidth={30}
                strokeDasharray={`${slice.length} ${C - slice.length}`}
                strokeDashoffset={slice.offset}
                strokeLinecap="butt"
                style={{ transition: 'all 0.4s ease' }}
              />
            ))}

            <circle cx={100} cy={100} r={55} fill="#1e1a2b" />
          </svg>

          <svg width={200} height={200} viewBox="0 0 200 200" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {donutSlices.map((slice) =>
              slice.showLabel ? (
                <text
                  key={`label-${slice.id}`}
                  x={slice.labelX}
                  y={slice.labelY}
                  fill="#ffffff"
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                >
                  {Math.round(slice.percent)}%
                </text>
              ) : null
            )}
          </svg>

          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>
              {centerDisplay.val}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#a8a0c2', marginTop: 4, letterSpacing: '0.06em' }}>
              {centerDisplay.unit}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: '#a8a0c2', textAlign: 'center', fontWeight: 500 }}>
          {diskUsageText}
        </div>

        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            marginTop: 14,
            marginBottom: 6,
          }}
        />
      </div>

      <div
        style={{
          backgroundColor: MD3.surface,
          borderRadius: 16,
          margin: '12px 10px 0',
          padding: '8px 0',
          overflow: 'hidden',
        }}
      >
        {CATEGORY_CONFIGS.map((cfg) => {
          const size = categoryStats[cfg.id]?.size || 0;
          const isChecked = !!selectedCategories[cfg.id];
          const percent = totalSize > 0 ? Math.round((size / totalSize) * 100) : 0;

          return (
            <div
              key={cfg.id}
              onClick={() => toggleCategory(cfg.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    backgroundColor: isChecked ? cfg.color : 'transparent',
                    border: isChecked ? 'none' : '2px solid rgba(255, 255, 255, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    flexShrink: 0,
                  }}
                >
                  {isChecked && <Check size={13} color="#ffffff" strokeWidth={3} />}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#ffffff' }}>
                    {t(cfg.labelKey)}
                  </span>
                  {size > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255, 255, 255, 0.55)' }}>
                      {percent}%
                    </span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#ffffff' }}>
                {formatBytes(size)}
              </div>
            </div>
          );
        })}

        <div style={{ padding: '14px 16px 8px' }}>
          <button
            type="button"
            onClick={handleClearSelected}
            disabled={selectedSize === 0 || isClearing}
            aria-label={
              allCategoriesSelected
                ? t('settings.clear_all_action', { size: formatBytes(selectedSize) })
                : t('settings.clear_selected_action', { size: formatBytes(selectedSize) })
            }
            style={{
              width: '100%',
              height: 44,
              borderRadius: 22,
              border: 'none',
              backgroundColor: selectedSize > 0 && !isClearing ? 'var(--accent-color, #7C3AED)' : 'rgba(255, 255, 255, 0.08)',
              color: selectedSize > 0 && !isClearing ? '#ffffff' : 'rgba(255, 255, 255, 0.3)',
              fontSize: 14,
              fontWeight: 600,
              cursor: selectedSize > 0 && !isClearing ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            {isClearing && <RefreshCw size={16} className="animate-spin" />}
            <span>
              {allCategoriesSelected
                ? t('settings.clear_all_action', { size: formatBytes(selectedSize) })
                : t('settings.clear_selected_action', { size: formatBytes(selectedSize) })}
            </span>
          </button>
        </div>
      </div>

      <div style={{ padding: '10px 20px 20px', fontSize: 12, color: '#8a82a2', lineHeight: 1.45 }}>
        {t('settings.cloud_storage_notice')}
      </div>

      <div style={{ marginTop: 8, marginBottom: 24 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--accent-color, #9b7dd4)',
            padding: '0 20px 8px 20px',
            letterSpacing: '0.01em',
          }}
        >
          {t('settings.chats_storage_header')}
        </div>

        <div
          style={{
            backgroundColor: MD3.surface,
            borderRadius: 16,
            margin: '0 10px',
            overflow: 'hidden',
          }}
        >
          {chatStatsList.length === 0 && orphanStats.size === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: MD3.onSurfaceVar, fontSize: 13 }}>
              {t('settings.no_chats_cached')}
            </div>
          ) : (
            <>
              {chatStatsList.map((item) => (
                <div
                  key={item.chatId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                      {item.avatarUrl ? (
                        <Avatar src={item.avatarUrl} alt={item.chatName} style={{ width: 38, height: 38 }} />
                      ) : (
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            backgroundColor: 'rgba(155, 125, 212, 0.25)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 15,
                            fontWeight: 600,
                          }}
                        >
                          {item.chatName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.chatName}
                      </div>
                      <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
                        {t('settings.files_count_short', { count: item.count })}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#ffffff' }}>
                      {formatBytes(item.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleClearChatCache(item.chatId)}
                      disabled={clearingChatId === item.chatId}
                      aria-label={t('settings.clear_chat_cache')}
                      style={{
                        padding: 6,
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: MD3.onSurfaceVar,
                        cursor: 'pointer',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 0.15s ease, background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = MD3.error;
                        e.currentTarget.style.backgroundColor = 'rgba(255, 89, 90, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = MD3.onSurfaceVar;
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {clearingChatId === item.chatId ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                </div>
              ))}

              {orphanStats.size > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: MD3.onSurfaceVar,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Database size={18} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>
                        {t('settings.other_chats_media')}
                      </div>
                      <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
                        {t('settings.files_count_short', { count: orphanStats.count })}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#ffffff' }}>
                      {formatBytes(orphanStats.size)}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearOrphanCache}
                      disabled={clearingChatId === 'orphan'}
                      aria-label={t('settings.clear_chat_cache')}
                      style={{
                        padding: 6,
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: MD3.onSurfaceVar,
                        cursor: 'pointer',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {clearingChatId === 'orphan' ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--accent-color, #9b7dd4)',
            padding: '0 20px 8px 20px',
            letterSpacing: '0.01em',
          }}
        >
          {t('settings.limits_section_title')}
        </div>

        <div
          style={{
            backgroundColor: MD3.surface,
            borderRadius: 16,
            margin: '0 10px',
            padding: '16px 0',
          }}
        >
          <BubbleSlider
            value={cacheSizeLimit}
            onChangeCommitted={onCacheSizeLimitChange}
            min={100 * 1024 * 1024}
            max={10 * 1024 * 1024 * 1024}
            step={100 * 1024 * 1024}
            label={t('settings.total_cache_limit')}
            formatValue={(v) => totalDisplay(v / (1024 * 1024))}
          />

          <BubbleSlider
            value={mediaCacheLimit}
            onChangeCommitted={onMediaCacheLimitChange}
            min={100 * 1024 * 1024}
            max={8 * 1024 * 1024 * 1024}
            step={100 * 1024 * 1024}
            label={t('settings.media_cache_limit')}
            formatValue={(v) => mediaDisplay(v / (1024 * 1024))}
          />

          <BubbleSlider
            value={cacheCleanupAge}
            onChangeCommitted={onCacheCleanupAgeChange}
            min={0}
            max={90 * 24 * 60 * 60 * 1000}
            step={7 * 24 * 60 * 60 * 1000}
            label={t('settings.cache_cleanup_age')}
            formatValue={(v) => ageDisplay(v)}
          />

          <div style={{ padding: '8px 20px 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 0 4px',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>
                  {t('settings.auto_load_media')}
                </div>
                <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
                  {t('settings.auto_load_media_desc')}
                </div>
              </div>
              <M3Switch checked={autoLoadMedia} onChange={onAutoLoadMediaChange} />
            </div>
          </div>
        </div>

        <div style={{ padding: '10px 20px', fontSize: 12, color: '#8a82a2', lineHeight: 1.45 }}>
          {t('settings.limits_section_desc')}
        </div>
      </div>

      <AnimatePresence>
        {feedbackToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(30, 26, 43, 0.95)',
              border: '1px solid rgba(155, 125, 212, 0.3)',
              color: '#ffffff',
              padding: '10px 20px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              zIndex: 9999,
            }}
          >
            {feedbackToast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
