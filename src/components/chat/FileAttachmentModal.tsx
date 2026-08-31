import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, MoreVertical, Smile, Play } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MD3CircularSpinner } from '../common/MD3CircularSpinner';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { EmojiPicker } from './EmojiPicker';

interface AudioMetadata {
  title: string;
  artist: string;
  duration: number;
  size: number;
  cover?: string | null;
}

export interface AttachedFile {
  filePath: string;
  preview: string | null;
  name: string;
  sizeMb: number;
  fileType: 'photo' | 'video' | 'audio' | 'document';
  uploadedMb: number;
  uploading: boolean;
  error: string | null;
  uploadedUrl: string | null;
  audioMetadata?: AudioMetadata;
  width?: number;
  height?: number;
  duration?: number;
}

interface FileAttachmentModalProps {
  files: AttachedFile[];
  isOpen: boolean;
  onClose: () => void;
  onAddFiles: () => void;
  onRemoveFile?: (index: number) => void;
  onSend: (caption: string, group: boolean, asFile: boolean) => void;
  isSending: boolean;
}

export const FileAttachmentModal = ({
  files,
  isOpen,
  onClose,
  onAddFiles,
  onRemoveFile,
  onSend,
  isSending,
}: FileAttachmentModalProps) => {
  const { t, i18n } = useTranslation();
  const [caption, setCaption] = useState('');
  const [group, setGroup] = useState(true);
  const [asFile, setAsFile] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);

  // Default group to true when 2+ files
  useEffect(() => {
    if (files.length > 1) {
      setGroup(true);
    }
  }, [files.length]);

  useEffect(() => {
    if (captionRef.current) {
      captionRef.current.style.height = 'auto';
      captionRef.current.style.height = Math.min(captionRef.current.scrollHeight, 100) + 'px';
    }
  }, [caption]);

  useEffect(() => {
    if (!isOpen) {
      setCaption('');
      setShowEmojiPicker(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setCaption('');
    setGroup(true);
    setAsFile(false);
    setShowEmojiPicker(false);
    onClose();
  };

  const handleSend = () => {
    onSend(caption, group, asFile);
    setCaption('');
  };

  if (!isOpen || files.length === 0) return null;

  const isSingleMedia = files.length === 1;
  const firstFile = files[0];
  const allPhotosOrVideos = files.every((f) => f.fileType === 'photo' || f.fileType === 'video');
  const showVisualMediaPreview = allPhotosOrVideos && !asFile;

  // Title formatting
  let title = '';
  if (isSingleMedia) {
    if (firstFile.fileType === 'photo') title = t('chatWindow.send_image', 'Отправить изображение');
    else if (firstFile.fileType === 'video') title = t('chatWindow.send_video', 'Отправить видео');
    else if (firstFile.fileType === 'audio') title = t('chatWindow.send_audio', 'Отправить аудиозапись');
    else title = t('chatWindow.send_file', 'Отправить файл');
  } else {
    const count = files.length;
    const isRu = i18n.language?.startsWith('ru');
    if (isRu) {
      const mod10 = count % 10;
      const mod100 = count % 100;
      let word = 'файлов';
      if (mod10 === 1 && mod100 !== 11) word = 'файл';
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'файла';
      title = `Выбрано ${count} ${word}`;
    } else {
      title = `${count} ${count === 1 ? 'file' : 'files'} selected`;
    }
  }

  const formatFileSize = (mb: number) => {
    if (mb < 1) {
      return `${(mb * 1024).toFixed(1)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[400] flex items-center justify-center select-none"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="w-full max-w-[420px] shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-secondary, #211b2b)',
              borderRadius: '10px',
              border: 'none',
              padding: '16px 20px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.65)',
            }}
          >
            {/* 1. Header */}
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-[15px] font-bold text-[var(--text-main)] truncate tracking-tight">
                {title}
              </h3>
              <div className="flex items-center gap-1 text-[var(--text-dim)]">
                <button
                  type="button"
                  className="hover:text-[var(--text-main)] transition-colors p-1 rounded-md"
                >
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>

            {/* 2. Content Area */}
            <div className="overflow-y-auto max-h-[340px] custom-scrollbar flex flex-col py-1">
              {showVisualMediaPreview ? (
                /* Visual Photo/Video Tiles (Single or Multiple Album) */
                isSingleMedia ? (
                  /* Single Image / Video Preview */
                  <div className="relative w-full max-h-[280px] rounded-lg overflow-hidden flex items-center justify-center bg-[var(--surface-muted,rgba(0,0,0,0.3))]">
                    {firstFile.preview ? (
                      firstFile.fileType === 'video' ? (
                        <video
                          src={firstFile.preview}
                          className="w-full h-full max-h-[280px] object-contain"
                          controls={false}
                        />
                      ) : (
                        <img
                          src={firstFile.preview}
                          alt={firstFile.name}
                          className="w-full h-full max-h-[280px] object-contain rounded-lg"
                        />
                      )
                    ) : (
                      <div className="w-full h-[180px] flex items-center justify-center">
                        <MD3CircularSpinner size="medium" color="var(--accent-color)" />
                      </div>
                    )}

                    {onRemoveFile && (
                      <button
                        type="button"
                        onClick={() => onRemoveFile(0)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white flex items-center justify-center transition-colors z-10"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ) : (
                  /* Multiple Photos/Videos Grid (Album Preview) */
                  <div
                    className={`grid gap-2 w-full ${
                      files.length === 2
                        ? 'grid-cols-2'
                        : files.length <= 4
                        ? 'grid-cols-2'
                        : 'grid-cols-3'
                    }`}
                  >
                    {files.map((file, idx) => {
                      const tileHeight =
                        files.length === 2
                          ? '160px'
                          : files.length <= 4
                          ? '125px'
                          : '95px';

                      return (
                        <div
                          key={idx}
                          className="relative rounded-lg overflow-hidden group bg-[var(--surface-muted,rgba(0,0,0,0.3))]"
                          style={{ height: tileHeight }}
                        >
                          {file.preview ? (
                            file.fileType === 'video' ? (
                              <video
                                src={file.preview}
                                className="w-full h-full object-cover rounded-lg"
                                controls={false}
                              />
                            ) : (
                              <img
                                src={file.preview}
                                alt={file.name}
                                className="w-full h-full object-cover rounded-lg"
                              />
                            )
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <MD3CircularSpinner size="small" color="var(--accent-color)" />
                            </div>
                          )}

                          {/* Video Badge */}
                          {file.fileType === 'video' && (
                            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white px-1.5 py-0.5 rounded text-[11px] font-medium">
                              <Play size={10} fill="white" />
                              {file.duration ? formatDuration(file.duration) : ''}
                            </div>
                          )}

                          {/* Remove button */}
                          {onRemoveFile && (
                            <button
                              type="button"
                              onClick={() => onRemoveFile(idx)}
                              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md text-white flex items-center justify-center transition-colors z-10"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                /* Multiple / Audio / File Items List */
                <div className="flex flex-col gap-2 w-full">
                  {files.map((file, idx) => {
                    const isAudio = file.fileType === 'audio';
                    const isPhotoOrVideo = file.fileType === 'photo' || file.fileType === 'video';

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 py-1 px-0 bg-transparent transition-colors"
                        style={{ backgroundColor: 'transparent' }}
                      >
                        {/* Thumbnail */}
                        <div className="w-10 h-10 flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-[var(--surface-muted,rgba(255,255,255,0.06))]">
                          {isAudio ? (
                            <AudioCoverWithPlay
                              cover={file.audioMetadata?.cover || null}
                              isPlayingTrack={false}
                              size={40}
                            />
                          ) : isPhotoOrVideo && file.preview ? (
                            <img
                              src={file.preview}
                              alt={file.name}
                              className="w-full h-full object-cover rounded-md"
                            />
                          ) : (
                            <FileText size={22} className="text-[var(--accent-light)]" />
                          )}
                        </div>

                        {/* Title & Size */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="text-[13.5px] font-bold text-[var(--text-main)] truncate leading-snug">
                            {isAudio && file.audioMetadata?.title
                              ? `${file.audioMetadata.artist ? `${file.audioMetadata.artist} – ` : ''}${file.audioMetadata.title}`
                              : file.name}
                          </div>
                          <div className="text-[12px] text-[var(--text-dim)] font-medium mt-0.5 tabular-nums">
                            {formatFileSize(file.sizeMb)}
                            {file.uploading && ` • ${(file.uploadedMb / file.sizeMb * 100).toFixed(0)}%`}
                          </div>
                        </div>

                        {/* Row Action Buttons */}
                        <div className="flex items-center gap-1.5 text-[var(--text-dim)]">
                          <button
                            type="button"
                            className="hover:text-[var(--text-main)] transition-colors p-1"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {onRemoveFile && (
                            <button
                              type="button"
                              onClick={() => onRemoveFile(idx)}
                              className="hover:text-white transition-colors p-1"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Checkboxes Area */}
            <div className="flex flex-col gap-2.5 pt-3 pb-2">
              {/* Send as file checkbox (for photos/videos) */}
              {allPhotosOrVideos && (
                <label
                  className="flex items-center gap-3 cursor-pointer select-none"
                  onClick={() => setAsFile(!asFile)}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      backgroundColor: asFile ? 'var(--accent-light, #a995ec)' : 'transparent',
                      border: asFile ? 'none' : '2px solid var(--border-color, rgba(255,255,255,0.3))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {asFile && (
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[13.5px] font-medium text-[var(--text-main)]">
                    {t('chatWindow.send_as_file', 'Отправить как файл')}
                  </span>
                </label>
              )}

              {/* Remember choice checkbox */}
              {asFile && (
                <label
                  className="flex items-center gap-3 cursor-pointer select-none"
                  onClick={() => setRememberChoice(!rememberChoice)}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      backgroundColor: rememberChoice ? 'var(--accent-light, #a995ec)' : 'transparent',
                      border: rememberChoice ? 'none' : '2px solid var(--border-color, rgba(255,255,255,0.3))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {rememberChoice && (
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[13.5px] font-medium text-[var(--text-main)]">
                    {t('chatWindow.remember_choice', 'Запомнить выбор')}
                  </span>
                </label>
              )}

              {/* Group checkbox */}
              {files.length > 1 && (
                <label
                  className="flex items-center gap-3 cursor-pointer select-none"
                  onClick={() => setGroup(!group)}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      backgroundColor: group ? 'var(--accent-light, #a995ec)' : 'transparent',
                      border: group ? 'none' : '2px solid var(--border-color, rgba(255,255,255,0.3))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {group && (
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[13.5px] font-medium text-[var(--text-main)]">
                    {t('chatWindow.group_files', 'Группировать')}
                  </span>
                </label>
              )}
            </div>

            {/* 4. Caption */}
            <div className="relative pt-2">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '2px solid var(--accent-light, #a995ec)',
                  paddingBottom: '4px',
                }}
              >
                <textarea
                  ref={captionRef}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={t('chatWindow.caption', 'Подпись...')}
                  className="w-full bg-transparent border-none outline-none resize-none text-[13.5px] text-[var(--text-main)] placeholder:text-[var(--text-dim)] min-h-[26px] max-h-[80px] leading-snug py-0.5"
                  rows={1}
                />
                <button
                  ref={emojiBtnRef}
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="text-[var(--text-dim)] hover:text-[var(--accent-light)] transition-colors p-1 rounded-full flex-shrink-0"
                >
                  <Smile size={20} />
                </button>
              </div>

              {/* Emoji Picker Popup */}
              {showEmojiPicker && (
                <div
                  className="absolute right-0 bottom-12 z-50 shadow-2xl rounded-xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <EmojiPicker
                    onSelect={(emoji: string) => {
                      setCaption((prev) => prev + emoji);
                    }}
                    onClose={() => setShowEmojiPicker(false)}
                    anchorEl={emojiBtnRef.current}
                    recentEmojis={[]}
                    onRecentUpdate={() => {}}
                  />
                </div>
              )}
            </div>

            {/* 5. Footer Action Text Buttons (No underline on hover!) */}
            <div className="flex items-center justify-between pt-5 pb-1">
              <button
                type="button"
                onClick={onAddFiles}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-light, #a995ec)',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  padding: 0,
                }}
                className="hover:opacity-80 transition-opacity"
              >
                {t('chatWindow.add_more', 'Добавить')}
              </button>

              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-light, #a995ec)',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  className="hover:opacity-80 transition-opacity"
                >
                  {t('common.cancel', 'Отмена')}
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isSending || files.length === 0}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-light, #a995ec)',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  className="hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSending ? (
                    <>
                      <MD3CircularSpinner size="small" color="var(--accent-light, #a995ec)" />
                      <span>{t('common.sending', 'Отправка...')}</span>
                    </>
                  ) : (
                    <span>{t('common.send', 'Отправить')}</span>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};