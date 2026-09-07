import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, UploadCloud, FileCheck, KeyRound, AlertCircle, Loader2 } from 'lucide-react';
import { restoreAccountBackup } from '../../services/accountBackupService';

interface AccountRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountRestoreModal: React.FC<AccountRestoreModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [phrase, setPhrase] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const parsedWords = phrase
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const handleFileChange = async (file: File) => {
    if (!file.name.endsWith('.orbita') && !file.name.includes('.')) {
      setErrorMessage(t('welcome.err_select_file'));
      return;
    }
    setErrorMessage(null);
    setSelectedFile(file);
    try {
      const buffer = await file.arrayBuffer();
      setFileBytes(buffer);
    } catch {
      setErrorMessage(t('welcome.err_corrupted'));
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleRestore = async () => {
    if (!fileBytes) {
      setErrorMessage(t('welcome.err_select_file'));
      return;
    }
    if (parsedWords.length !== 12) {
      setErrorMessage(t('welcome.err_invalid_phrase'));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await restoreAccountBackup(fileBytes, phrase);
      onClose();
    } catch (err: any) {
      if (err?.message === 'INVALID_MNEMONIC') {
        setErrorMessage(t('welcome.err_restore_failed'));
      } else {
        setErrorMessage(t('welcome.err_corrupted'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(8px)',
          padding: '16px',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isLoading) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: '100%',
            maxWidth: '520px',
            backgroundColor: 'var(--bg-secondary, #1e1a2b)',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(155, 125, 212, 0.16)',
                  color: 'var(--accent-color, #9b7dd4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyRound size={20} />
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '17px',
                    fontWeight: 700,
                    color: '#ffffff',
                  }}
                >
                  {t('welcome.restore_title')}
                </h3>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12.5px',
                    color: 'rgba(255, 255, 255, 0.55)',
                  }}
                >
                  {t('welcome.restore_desc')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              aria-label={t('common.close')}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".orbita"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.85)',
                  marginBottom: '8px',
                }}
              >
                {t('welcome.select_file')}
              </label>

              {!selectedFile ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed ' + (isDragOver ? 'var(--accent-color, #9b7dd4)' : 'rgba(255, 255, 255, 0.16)'),
                    backgroundColor: isDragOver ? 'rgba(155, 125, 212, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '14px',
                    padding: '24px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--accent-color, #9b7dd4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UploadCloud size={24} />
                  </div>
                  <div style={{ fontSize: '13.5px', color: '#ffffff', fontWeight: 550 }}>
                    {t('welcome.drop_file_here')}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    backgroundColor: 'rgba(155, 125, 212, 0.1)',
                    border: '1px solid rgba(155, 125, 212, 0.3)',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div style={{ color: 'var(--accent-color, #9b7dd4)' }}>
                      <FileCheck size={24} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#ffffff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {selectedFile.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        {formatFileSize(selectedFile.size)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label={t('welcome.change_file')}
                    style={{
                      border: 'none',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {t('welcome.change_file')}
                  </button>
                </div>
              )}
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <label
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.85)',
                  }}
                >
                  {t('welcome.phrase_label')}
                </label>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: parsedWords.length === 12 ? 'var(--accent-color, #9b7dd4)' : 'rgba(255, 255, 255, 0.45)',
                  }}
                >
                  {t('welcome.words_count', { count: parsedWords.length })}
                </span>
              </div>

              <textarea
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={t('welcome.phrase_placeholder')}
                rows={3}
                aria-label={t('welcome.phrase_label')}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'none',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />

              {parsedWords.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    marginTop: '10px',
                    maxHeight: '110px',
                    overflowY: 'auto',
                  }}
                >
                  {parsedWords.map((word, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        fontSize: '12px',
                        color: 'rgba(255, 255, 255, 0.9)',
                      }}
                    >
                      <span style={{ opacity: 0.5, fontSize: '10px' }}>{idx + 1}</span>
                      <span style={{ fontWeight: 550 }}>{word}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {errorMessage && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '13px',
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleRestore}
              disabled={isLoading || !fileBytes || parsedWords.length !== 12}
              aria-label={t('welcome.restore_button')}
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor:
                  !isLoading && fileBytes && parsedWords.length === 12
                    ? 'var(--accent-color, #9b7dd4)'
                    : 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 650,
                cursor:
                  !isLoading && fileBytes && parsedWords.length === 12
                    ? 'pointer'
                    : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                marginTop: '4px',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>{t('welcome.restoring')}</span>
                </>
              ) : (
                <span>{t('welcome.restore_button')}</span>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
