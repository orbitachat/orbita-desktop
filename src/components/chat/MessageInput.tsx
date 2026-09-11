import React, { useRef, useEffect, useState, memo, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { CustomEditIcon, CustomReplyIcon } from './ChatWindow';
import { useChatStore, type LinkPreviewData } from '../../store/useChatStore';
import { InputContextMenu, FormattingType } from './InputContextMenu';
import { extractFirstUrl, fetchLinkPreview } from '../../utils/linkPreviewUtils';
import { htmlToMarkdown, markdownToHtml, formatPreviewText } from '../../utils/messageUtils';
import { ChannelMegaphoneIcon } from '../common/ChannelMegaphoneIcon';
import { BotIcon } from '../common/BotIcon';
import { supportService } from '../../services/supportService';

const FileWithArrowIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M9 13h6" />
    <path d="m12 10 3 3-3 3" />
  </svg>
);

const AttachIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="1.5"
  >
    <path d="m7.918 17.807l7.89-7.553a2.253 2.253 0 0 0 0-3.284a2.503 2.503 0 0 0-3.43 0l-7.834 7.498a4.28 4.28 0 0 0 0 6.24c1.8 1.723 4.718 1.723 6.518 0l7.949-7.608c2.652-2.54 2.652-6.656 0-9.196s-6.954-2.539-9.607 0L3 10.034" />
  </svg>
);

const EmojiIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="23"
    height="23"
  >
    <g fill="none">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <circle cx="9" cy="9.5" r="1.25" fill="currentColor" />
      <circle cx="15" cy="9.5" r="1.25" fill="currentColor" />
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.464 14.25a4 4 0 0 1-6.928 0" />
    </g>
  </svg>
);

const MicIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    width="23"
    height="23"
  >
    <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="3.5">
      <rect width="14" height="27" x="17" y="4" rx="7" />
      <path strokeLinecap="round" d="M9 23c0 8.284 6.716 15 15 15s15-6.716 15-15M24 38v6" />
    </g>
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor">
    <path d="m476.59 227.05l-.16-.07L49.35 49.84A23.56 23.56 0 0 0 27.14 52A24.65 24.65 0 0 0 16 72.59v113.29a24 24 0 0 0 19.52 23.57l232.93 43.07a4 4 0 0 1 0 7.86L35.53 303.45A24 24 0 0 0 16 327v113.31A23.57 23.57 0 0 0 26.59 460a23.94 23.94 0 0 0 13.22 4a24.55 24.55 0 0 0 9.52-1.93L476.4 285.94l.19-.09a32 32 0 0 0 0-58.8" />
  </svg>
);

const ConfirmEditIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export { htmlToMarkdown, markdownToHtml };



interface MessageInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  editingIndex: number | null;
  editingOriginalText?: string;
  onCancelEdit?: () => void;
  editText: string;
  setEditText: (text: string) => void;
  replyingTo: { index: number; sender: string; text: string; time: number } | null;
  setReplyingTo: (reply: null | { index: number; sender: string; text: string; time: number }) => void;
  isRecording: boolean;
  isRecordingPaused?: boolean;
  recordingTime: number;
  recordingAmplitude?: number;
  onSendMessage: (overrideText?: string, linkPreview?: LinkPreviewData) => void;
  onEditMessage: (overrideText?: string) => void;
  onStopRecording: () => void;
  onStartRecording: () => void;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onCancelRecording?: () => void;
  onFilePick: () => void;
  onToggleEmoji: () => void;
  isEmojiOpen: boolean;
  canSend: boolean;
  isPrivateChat: boolean;
  isChannel?: boolean;
  isRatchetReady?: boolean;
  emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
  inputRef?: React.RefObject<HTMLDivElement | null>;
  onOpenTxtModal?: () => void;
  onEmojiMouseEnter?: () => void;
  onEmojiMouseLeave?: () => void;
}

export const MessageInput = memo<MessageInputProps>(({
  inputText,
  setInputText,
  editingIndex,
  editingOriginalText,
  onCancelEdit,
  editText,
  setEditText,
  replyingTo,
  setReplyingTo,
  isRecording,
  isRecordingPaused = false,
  recordingTime,
  recordingAmplitude: _recordingAmplitude = 0,
  onSendMessage,
  onEditMessage,
  onStopRecording,
  onStartRecording,
  onPauseRecording: _onPauseRecording,
  onResumeRecording: _onResumeRecording,
  onCancelRecording,
  onFilePick,
  onToggleEmoji,
  isEmojiOpen,
  canSend,
  isPrivateChat: _isPrivateChat,
  isChannel = false,
  isRatchetReady = true,
  emojiButtonRef,
  inputRef,
  onOpenTxtModal,
  onEmojiMouseEnter,
  onEmojiMouseLeave,
}) => {
  const { t, i18n } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const sendOnEnter = useChatStore((state) => state.sendOnEnter);

  const [hoverAttach, setHoverAttach] = useState(false);
  const [hoverEmoji, setHoverEmoji] = useState(false);
  const [hoverMic, setHoverMic] = useState(false);

  useEffect(() => {
    setHoverMic(false);
    setHoverAttach(false);
    setHoverEmoji(false);
  }, [isRecording]);

  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const [linkModalData, setLinkModalData] = useState<{ open: boolean; text: string; url: string; range: Range | null }>({ open: false, text: '', url: '', range: null });

  const currentText = editingIndex !== null ? editText : inputText;
  const setCurrentText = editingIndex !== null ? setEditText : setInputText;

  const linkPreviewsEnabled = useChatStore((state) => state.linkPreviewsEnabled);
  const [liveLinkPreview, setLiveLinkPreview] = useState<LinkPreviewData | null>(null);
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);

  const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeChatId = useChatStore((state) => state.activeChatId);
  const [slashQuery, setSlashQuery] = useState('');
  const [showCommandsMenu, setShowCommandsMenu] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const availableCommands = useMemo(() => {
    if (activeChatId === 'system_support') {
      if (supportService.isAdmin) {
        return [
          { command: '/reply', desc: t('commands.support_admin_reply_desc', 'Ответить на обращение: /reply #T-XXXXX <текст>') },
          { command: '/tickets', desc: t('commands.support_admin_tickets_desc', 'Показать список открытых обращений') },
          { command: '/help', desc: t('support.admin_help', 'Справка администратора поддержки') },
        ];
      }
      return [
        { command: '/start', desc: t('commands.support_start_desc', 'Начать диалог с поддержкой') },
        { command: '/ticket', desc: t('commands.support_ticket_desc', 'Проверить статус обращений') },
        { command: '/help', desc: t('commands.support_help_desc', 'Как получить помощь') },
        { command: '/faq', desc: t('commands.support_faq_desc', 'Частые вопросы перед обращением') },
      ];
    }
    return [
      { command: '/start', desc: t('commands.start_desc', 'Запустить бота и получить приветствие') },
      { command: '/help', desc: t('commands.help_desc', 'Справка и список возможностей') },
      { command: '/backup', desc: t('commands.backup_desc', 'Инструкция и создание резервной копии') },
      { command: '/channels', desc: t('commands.channels_desc', 'Официальные каналы и новости') },
      { command: '/security', desc: t('commands.security_desc', 'Сквозное шифрование и безопасность') },
      { command: '/privacy', desc: t('commands.privacy_desc', 'Конфиденциальность и скрытие ID') },
      { command: '/calls', desc: t('commands.calls_desc', 'Голосовые и видеозвонки P2P') },
      { command: '/appearance', desc: t('commands.appearance_desc', 'Оформление, темы и кастомизация') },
      { command: '/network', desc: t('commands.network_desc', 'Сеть, WebRTC и прокси') },
      { command: '/proxy', desc: t('commands.proxy_desc', 'Настройки сетевого прокси') },
      { command: '/faq', desc: t('commands.faq_desc', 'Часто задаваемые вопросы') },
      { command: '/about', desc: t('commands.about_desc', 'О мессенджере Orbita') },
    ];
  }, [activeChatId, t]);

  const filteredCommands = useMemo(() => {
    if (!slashQuery.startsWith('/')) return [];
    const q = slashQuery.slice(1).toLowerCase().trim();
    if (!q) return availableCommands;
    return availableCommands.filter((c) => c.command.slice(1).toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
  }, [availableCommands, slashQuery]);

  const executeCommand = useCallback((cmdStr: string) => {
    setShowCommandsMenu(false);
    setSlashQuery('');
    if (cmdStr === '/reply') {
      setCurrentText('/reply ');
      if (editorRef.current) {
        editorRef.current.innerHTML = '/reply ';
        setIsEditorEmpty(false);
        placeCaretAtEnd(editorRef.current);
      }
      return;
    }
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
      setIsEditorEmpty(true);
    }
    setCurrentText('');
    onSendMessage(cmdStr);
  }, [onSendMessage, setCurrentText]);

  useEffect(() => {
    const trimmed = currentText.trim();
    if (trimmed.startsWith('/')) {
      setSlashQuery(trimmed);
      setShowCommandsMenu(true);
      setSelectedCommandIndex(0);
    } else {
      setShowCommandsMenu(false);
      setSlashQuery('');
    }
  }, [currentText]);

  useEffect(() => {
    if (!linkPreviewsEnabled || editingIndex !== null) {
      setLiveLinkPreview(null);
      return;
    }
    if (linkPreviewTimerRef.current) clearTimeout(linkPreviewTimerRef.current);
    linkPreviewTimerRef.current = setTimeout(() => {
      const url = extractFirstUrl(currentText);
      if (!url || url === dismissedUrl) {
        if (!url) setDismissedUrl(null);
        setLiveLinkPreview(null);
        return;
      }
      let isMounted = true;
      fetchLinkPreview(url).then((data) => {
        if (isMounted) {
          setLiveLinkPreview(data);
        }
      });
    }, 400);

    return () => {
      if (linkPreviewTimerRef.current) clearTimeout(linkPreviewTimerRef.current);
    };
  }, [currentText, linkPreviewsEnabled, dismissedUrl, editingIndex]);

  // Track true emptiness for placeholder rendering locally without lagging the main thread
  const [isEditorEmpty, setIsEditorEmpty] = useState(!currentText.trim());

  // Forward ref for external components if needed
  useEffect(() => {
    if (inputRef) {
      (inputRef as React.MutableRefObject<HTMLDivElement | null>).current = editorRef.current;
    }
  }, [inputRef]);

  const placeCaretAtEnd = (el: HTMLElement) => {
    el.focus();
    if (typeof window.getSelection !== 'undefined' && typeof document.createRange !== 'undefined') {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  // Handle focus when replying, editing, mounting, or returning to chat
  useEffect(() => {
    if (editorRef.current) {
      setTimeout(() => {
        if (editorRef.current) {
          placeCaretAtEnd(editorRef.current);
        }
      }, 0);
    }
  }, [editingIndex, replyingTo]);

  const isInternalInputRef = useRef(false);
  const syncDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external text changes (like edit/clear or restoring draft) to contentEditable
  useEffect(() => {
    if (isInternalInputRef.current) {
      isInternalInputRef.current = false;
      return;
    }
    if (editorRef.current) {
      if (currentText === '') {
        if (editorRef.current.innerHTML !== '') {
          editorRef.current.innerHTML = '';
        }
        setIsEditorEmpty(true);
        return;
      }

      const currentMd = htmlToMarkdown(editorRef.current);
      if (currentMd.trim() !== currentText.trim()) {
        editorRef.current.innerHTML = markdownToHtml(currentText, 'inherit', true);
        setIsEditorEmpty(currentText.trim() === '');
        setTimeout(() => {
          if (editorRef.current) {
            placeCaretAtEnd(editorRef.current);
          }
        }, 0);
      }
    }
  }, [currentText]);

  const cancelCurrentAction = () => {
    if (editingIndex !== null) {
      if (onCancelEdit) {
        onCancelEdit();
      } else {
        setEditText('');
      }
    } else if (replyingTo) {
      setReplyingTo(null);
    }
    if (editorRef.current) {
      placeCaretAtEnd(editorRef.current);
    }
  };

  const syncEditorToState = useCallback(() => {
    if (editorRef.current) {
      isInternalInputRef.current = true;
      const md = htmlToMarkdown(editorRef.current);
      setCurrentText(md);
    }
  }, [setCurrentText]);

  const handleEditorInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const raw = el.innerText.replace(/\u200B/g, '');
    const empty = raw.trim() === '';
    if (empty !== isEditorEmpty) {
      setIsEditorEmpty(empty);
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith('/')) {
      setSlashQuery(trimmed);
      setShowCommandsMenu(true);
      setSelectedCommandIndex(0);
    } else {
      setShowCommandsMenu(false);
      setSlashQuery('');
    }

    if (syncDebounceTimerRef.current) clearTimeout(syncDebounceTimerRef.current);
    syncDebounceTimerRef.current = setTimeout(() => {
      syncEditorToState();
    }, 150);
  };

  const handleSend = () => {
    setShowCommandsMenu(false);
    setSlashQuery('');
    if (syncDebounceTimerRef.current) {
      clearTimeout(syncDebounceTimerRef.current);
      syncDebounceTimerRef.current = null;
    }
    let textToSend = currentText;
    if (editorRef.current) {
      textToSend = htmlToMarkdown(editorRef.current);
      editorRef.current.innerHTML = '';
      setIsEditorEmpty(true);
    }
    setCurrentText('');
    if (editingIndex !== null) {
      onEditMessage(textToSend);
    } else {
      onSendMessage(textToSend, liveLinkPreview || undefined);
      setLiveLinkPreview(null);
      setDismissedUrl(null);
    }
  };

  const applyFormatting = (type: FormattingType) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    switch (type) {
      case 'bold':
        document.execCommand('bold', false);
        break;
      case 'italic':
        document.execCommand('italic', false);
        break;
      case 'underline':
        document.execCommand('underline', false);
        break;
      case 'strikethrough':
        document.execCommand('strikeThrough', false);
        break;
      case 'monospace': {
        const codeEl = document.createElement('code');
        codeEl.style.fontFamily = 'monospace';
        codeEl.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
        codeEl.style.padding = '2px 4px';
        codeEl.style.borderRadius = '4px';
        try {
          range.surroundContents(codeEl);
        } catch {
          document.execCommand('insertHTML', false, `<code style="font-family:monospace;background:rgba(255,255,255,0.12);padding:2px 4px;border-radius:4px;">${sel.toString()}</code>`);
        }
        break;
      }
      case 'quote': {
        const blockquoteEl = document.createElement('blockquote');
        blockquoteEl.style.borderLeft = '3px solid var(--accent-color, #7C3AED)';
        blockquoteEl.style.paddingLeft = '8px';
        blockquoteEl.style.margin = '4px 0';
        try {
          range.surroundContents(blockquoteEl);
        } catch {
          document.execCommand('insertHTML', false, `<blockquote style="border-left:3px solid var(--accent-color, #7C3AED);padding-left:8px;margin:4px 0;">${sel.toString() || t('inputContextMenu.quote')}</blockquote>`);
        }
        break;
      }
      case 'link': {
        setIsContextMenuOpen(false);
        setLinkModalData({ open: true, text: sel.toString(), url: '', range: range.cloneRange() });
        break;
      }
      case 'spoiler': {
        const spoilerEl = document.createElement('span');
        spoilerEl.className = 'spoiler';
        spoilerEl.setAttribute('data-spoiler', 'true');
        spoilerEl.style.backgroundColor = 'rgba(255, 255, 255, 0.18)';
        spoilerEl.style.filter = 'blur(3px)';
        spoilerEl.style.padding = '0 3px';
        spoilerEl.style.borderRadius = '4px';
        try {
          range.surroundContents(spoilerEl);
        } catch {
          document.execCommand('insertHTML', false, `<span class="spoiler" data-spoiler="true" style="background:rgba(255,255,255,0.18);filter:blur(3px);padding:0 3px;border-radius:4px;">${sel.toString()}</span>`);
        }
        break;
      }
      case 'date': {
        const dateLocale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';
        const dateStr = new Date().toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        document.execCommand('insertText', false, dateStr);
        break;
      }
      case 'clear':
        document.execCommand('removeFormat', false);
        break;
    }
    syncEditorToState();
    if (editorRef.current) {
      placeCaretAtEnd(editorRef.current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRatchetReady) {
      e.preventDefault();
      return;
    }
    const isCmdOrCtrl = e.ctrlKey || e.metaKey;

    if (isCmdOrCtrl) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        applyFormatting('bold');
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        applyFormatting('italic');
        return;
      }
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        applyFormatting('underline');
        return;
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        applyFormatting('link');
        return;
      }
      if (e.shiftKey) {
        if (e.key === 'X' || e.key === 'x') {
          e.preventDefault();
          applyFormatting('strikethrough');
          return;
        }
        if (e.key === 'M' || e.key === 'm') {
          e.preventDefault();
          applyFormatting('monospace');
          return;
        }
        if (e.key === 'P' || e.key === 'p') {
          e.preventDefault();
          applyFormatting('spoiler');
          return;
        }
      }
    }

    if (showCommandsMenu && filteredCommands.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const targetCmd = filteredCommands[selectedCommandIndex] || filteredCommands[0];
        if (targetCmd) {
          executeCommand(targetCmd.command);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommandsMenu(false);
        return;
      }
    }

    if (e.key === 'Enter') {
      if (sendOnEnter) {
        if (!e.shiftKey && !isCmdOrCtrl) {
          e.preventDefault();
          if (editingIndex !== null) {
            handleSend();
          } else {
            if (canSend || !isEditorEmpty) {
              handleSend();
            }
          }
        }
      } else {
        if (isCmdOrCtrl) {
          e.preventDefault();
          if (editingIndex !== null) {
            handleSend();
          } else {
            if (canSend || !isEditorEmpty) {
              handleSend();
            }
          }
        }
      }
    }
    if (e.key === 'Escape') {
      cancelCurrentAction();
    }
  };

  const handleEditorContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const sel = window.getSelection();
    setHasSelection(!!(sel && sel.toString().trim().length > 0));
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setIsContextMenuOpen(true);
  };

  const formatDurationWithTenths = (totalSeconds: number) => {
    const totalTenths = Math.floor(Math.max(0, totalSeconds) * 10);
    const m = Math.floor(totalTenths / 600);
    const s = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${tenths}`;
  };

  const isHasContent = canSend || !isEditorEmpty;
  const attachColor = hoverAttach ? 'var(--text-main)' : 'var(--text-dim)';
  const emojiColor = (hoverEmoji || isEmojiOpen) ? 'var(--text-main)' : 'var(--text-dim)';
  const micColor = (isRecording || (isHasContent && !isRecording)) ? (hoverMic ? 'var(--text-main)' : 'var(--accent-color)') : (hoverMic ? 'var(--text-main)' : 'var(--text-dim)');

  const showActionBanner = editingIndex !== null || replyingTo !== null;
  const isRecordingActive = isRecording || isRecordingPaused;

  return (
    <div
      style={{
        position: 'relative',
        flexShrink: 0,
        zIndex: 10,
        backgroundColor: 'transparent',
        padding: '6px 14px 10px 14px',
        borderTop: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      {showCommandsMenu && filteredCommands.length > 0 && !isRecordingActive && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            maxHeight: '136px',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-secondary, #20222b)',
            borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.3)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {filteredCommands.map((cmd, idx) => (
            <div
              key={cmd.command}
              role="option"
              aria-selected={idx === selectedCommandIndex}
              onClick={() => executeCommand(cmd.command)}
              onMouseEnter={() => setSelectedCommandIndex(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 16px',
                minHeight: '34px',
                cursor: 'pointer',
                backgroundColor: idx === selectedCommandIndex ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                transition: 'background-color 0.1s ease',
              }}
            >
              <BotIcon size={16} className="text-accent" />
              <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-main, #ffffff)', flexShrink: 0 }}>
                {cmd.command}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-dim, rgba(255, 255, 255, 0.5))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cmd.desc}
              </span>
            </div>
          ))}
        </div>
      )}

      {liveLinkPreview && !isRecordingActive && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            width: '100%',
            paddingBottom: '8px',
            marginBottom: '6px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            <div style={{ width: '3px', height: '32px', borderRadius: '2px', backgroundColor: 'var(--accent-color)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <div style={{ color: 'var(--accent-color)', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {liveLinkPreview.siteName || 'Предпросмотр ссылки'}
              </div>
              <div style={{ color: 'var(--text-main)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {liveLinkPreview.title || liveLinkPreview.url}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setDismissedUrl(liveLinkPreview.url);
              setLiveLinkPreview(null);
            }}
            style={{
              color: 'var(--text-dim)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {showActionBanner && !isRecordingActive && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            width: '100%',
            paddingBottom: '8px',
            marginBottom: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--accent-color)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {editingIndex !== null ? <CustomEditIcon size={18} /> : <CustomReplyIcon size={18} />}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <div style={{ color: 'var(--accent-color)', fontSize: '13.5px', fontWeight: 600, lineHeight: 1.2 }}>
                {editingIndex !== null ? (
                  t('chatWindow.editing')
                ) : isChannel && replyingTo ? (
                  (() => {
                    const full = t('chatWindow.reply_to', { sender: '___ORBITA_SENDER___' });
                    const parts = full.split('___ORBITA_SENDER___');
                    return (
                      <span className="inline-flex items-center gap-1 min-w-0 truncate">
                        {parts[0] && <span>{parts[0]}</span>}
                        <ChannelMegaphoneIcon size={13} className="flex-shrink-0" />
                        <span className="truncate">{replyingTo.sender}</span>
                        {parts[1] && <span>{parts[1]}</span>}
                      </span>
                    );
                  })()
                ) : (
                  t('chatWindow.reply_to', { sender: replyingTo?.sender || '' })
                )}
              </div>
              <div
                style={{
                  color: 'var(--text-dim)',
                  fontSize: '13px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.35,
                  marginTop: '1px',
                  maxHeight: '20px',
                }}
                dangerouslySetInnerHTML={{
                  __html: markdownToHtml(
                    formatPreviewText(
                      editingIndex !== null ? (editingOriginalText || editText) : (replyingTo?.text || ''),
                      t
                    ),
                    'inherit',
                    true
                  ).replace(/<br\s*\/?>/gi, ' '),
                }}
              />
            </div>
          </div>

          <button
            onClick={cancelCurrentAction}
            style={{
              color: 'var(--text-dim)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'color 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {isRecordingActive ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            minHeight: '31px',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                display: 'inline-block',
                animation: 'pulse 1s infinite',
              }}
            />
            <span
              style={{
                color: 'var(--text-main)',
                fontSize: '15px',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatDurationWithTenths(recordingTime)}
            </span>
          </div>

          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setHoverMic(false);
              setHoverAttach(false);
              setHoverEmoji(false);
              window.getSelection()?.removeAllRanges();
              if (onCancelRecording) onCancelRecording();
            }}
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'none',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              color: 'var(--accent-color, #7C3AED)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 12px',
              borderRadius: '6px',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {t('chatWindow.cancel_recording', 'Отмена')}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setHoverMic(false);
              setHoverAttach(false);
              setHoverEmoji(false);
              window.getSelection()?.removeAllRanges();
              onStopRecording();
            }}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              color: 'var(--accent-color, #7C3AED)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, opacity 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent-color, #7C3AED)'; }}
          >
            <SendIcon />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', position: 'relative', transform: 'translateY(2.5px)' }}>
          {currentText.length > 256 && onOpenTxtModal && (
            <button
              type="button"
              tabIndex={-1}
              onClick={onOpenTxtModal}
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '0px',
                marginBottom: '6px',
                backgroundColor: 'var(--bg-secondary, #252836)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                outline: 'none',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                color: 'var(--accent-color, #7C3AED)',
                borderRadius: '50%',
                width: '34px',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, background-color 0.15s ease',
                zIndex: 20,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <FileWithArrowIcon />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            disabled={!isRatchetReady}
            onClick={isRatchetReady ? onFilePick : undefined}
            onFocus={(e) => e.currentTarget.blur()}
            aria-label={t('chatWindow.attach_file', 'Прикрепить файл')}
            onMouseEnter={() => isRatchetReady && setHoverAttach(true)}
            onMouseLeave={() => setHoverAttach(false)}
            style={{
              background: 'transparent',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              color: attachColor,
              cursor: isRatchetReady ? 'pointer' : 'not-allowed',
              opacity: isRatchetReady ? 1 : 0.35,
              width: '32px',
              height: '32px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, opacity 0.2s',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              flexShrink: 0,
            }}
          >
            <AttachIcon />
          </button>

          <div
            style={{
              flex: 1,
              backgroundColor: 'var(--surface-container, #33363f)',
              borderRadius: '20px',
              padding: '0 14px',
              minHeight: '34px',
              maxHeight: '120px',
              display: 'flex',
              alignItems: 'center',
              boxSizing: 'border-box',
              position: 'relative',
              transition: 'background-color 0.15s ease',
            }}
          >
            <div
              ref={editorRef}
              contentEditable={isRatchetReady}
              suppressContentEditableWarning
              spellCheck={false}
              data-empty={isEditorEmpty}
              data-placeholder={
                !isRatchetReady
                  ? t('chatWindow.waiting_first_message')
                  : editingIndex !== null
                    ? t('chatWindow.edit_message_placeholder')
                    : t('chatWindow.placeholder')
              }
              onInput={handleEditorInput}
              onKeyDown={handleKeyDown}
              onContextMenu={handleEditorContextMenu}
              className="rich-editor"
              style={{
                flex: 1,
                position: 'relative',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main)',
                fontSize: '14px',
                lineHeight: '20px',
                fontFamily: 'inherit',
                minHeight: '20px',
                maxHeight: '120px',
                overflowY: 'auto',
                padding: '0',
                width: '100%',
                caretColor: 'var(--scroll-thumb-color, rgba(255, 255, 255, 0.45))',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                userSelect: isRatchetReady ? 'text' : 'none',
                WebkitUserSelect: isRatchetReady ? 'text' : 'none',
                cursor: isRatchetReady ? 'text' : 'not-allowed',
                opacity: isRatchetReady ? 1 : 0.6,
              }}
            />
          </div>

          <button
            type="button"
            tabIndex={-1}
            ref={emojiButtonRef}
            disabled={!isRatchetReady}
            onClick={onToggleEmoji}
            aria-label={t('chatWindow.emoji', 'Эмодзи')}
            onMouseEnter={() => {
              if (isRatchetReady) {
                setHoverEmoji(true);
                if (onEmojiMouseEnter) onEmojiMouseEnter();
              }
            }}
            onMouseLeave={() => {
              setHoverEmoji(false);
              if (onEmojiMouseLeave) onEmojiMouseLeave();
            }}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              color: emojiColor,
              cursor: isRatchetReady ? 'pointer' : 'not-allowed',
              opacity: isRatchetReady ? 1 : 0.35,
              width: '32px',
              height: '32px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, opacity 0.2s',
              flexShrink: 0,
            }}
          >
            <EmojiIcon />
          </button>

          <button
            type="button"
            tabIndex={-1}
            disabled={!isRatchetReady}
            onClick={
              !isRatchetReady
                ? undefined
                : (editingIndex !== null || isHasContent)
                  ? handleSend
                  : () => {
                    setHoverMic(false);
                    onStartRecording();
                  }
            }
            aria-label={editingIndex !== null ? t('chatWindow.confirm_edit', 'Сохранить') : isHasContent ? t('chatWindow.send', 'Отправить') : t('chatWindow.voice_message', 'Голосовое сообщение')}
            onMouseEnter={() => isRatchetReady && setHoverMic(true)}
            onMouseLeave={() => setHoverMic(false)}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              color: !isRatchetReady ? 'var(--text-dim)' : editingIndex !== null ? 'var(--accent-color)' : micColor,
              cursor: !isRatchetReady ? 'not-allowed' : 'pointer',
              opacity: !isRatchetReady ? 0.35 : 1,
              width: '32px',
              height: '32px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, opacity 0.2s',
              flexShrink: 0,
            }}
          >
            {editingIndex !== null ? (
              <ConfirmEditIcon />
            ) : isHasContent ? (
              <SendIcon />
            ) : (
              <MicIcon />
            )}
          </button>
        </div>
      )}

      <InputContextMenu
        x={contextMenuPos.x}
        y={contextMenuPos.y}
        isOpen={isContextMenuOpen}
        onClose={() => setIsContextMenuOpen(false)}
        onUndo={() => document.execCommand('undo')}
        onRedo={() => document.execCommand('redo')}
        onCut={() => {
          document.execCommand('cut');
          syncEditorToState();
        }}
        onCopy={() => {
          document.execCommand('copy');
        }}
        onPaste={async () => {
          try {
            const clipText = await navigator.clipboard.readText();
            if (clipText) {
              document.execCommand('insertText', false, clipText);
              syncEditorToState();
            }
          } catch { }
        }}
        onDelete={() => {
          document.execCommand('delete');
          syncEditorToState();
        }}
        onSelectAll={() => {
          document.execCommand('selectAll');
        }}
        onFormat={applyFormatting}
        hasSelection={hasSelection}
      />

      {linkModalData.open && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          }}
          onClick={() => setLinkModalData({ ...linkModalData, open: false })}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary, #252836)',
              borderRadius: '8px',
              padding: '20px',
              width: '320px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              color: 'var(--text-main)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: '15px' }}>{t('inputContextMenu.add_link')}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-dim, rgba(255,255,255,0.45))' }}>{t('inputContextMenu.text')}</label>
              <input
                type="text"
                value={linkModalData.text}
                onChange={(e) => setLinkModalData({ ...linkModalData, text: e.target.value })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text-main)',
                  padding: '4px 0',
                  outline: 'none',
                  fontSize: '14px'
                }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-dim, rgba(255,255,255,0.45))' }}>{t('inputContextMenu.url')}</label>
              <input
                type="text"
                value={linkModalData.url}
                onChange={(e) => setLinkModalData({ ...linkModalData, url: e.target.value })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--accent-color, #7C3AED)',
                  color: 'var(--text-main)',
                  padding: '4px 0',
                  outline: 'none',
                  fontSize: '14px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const confirmBtn = document.getElementById('add-link-confirm-btn');
                    if (confirmBtn) confirmBtn.click();
                  }
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', marginTop: '8px' }}>
              <button
                onClick={() => setLinkModalData({ ...linkModalData, open: false })}
                style={{ color: 'var(--accent-color, #7C3AED)', background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', padding: 0 }}
                className="hover:opacity-80 transition-opacity"
              >
                {t('inputContextMenu.cancel')}
              </button>
              <button
                id="add-link-confirm-btn"
                onClick={() => {
                  setLinkModalData({ ...linkModalData, open: false });
                  if (linkModalData.url && linkModalData.range) {
                    const { text, url, range } = linkModalData;
                    const a = document.createElement('a');
                    a.href = url.startsWith('http') ? url : `https://${url}`;
                    a.textContent = text || url;
                    a.style.color = 'var(--accent-color, #7C3AED)';
                    a.style.textDecoration = 'none';
                    a.style.cursor = 'pointer';

                    const sel = window.getSelection();
                    if (sel) {
                      sel.removeAllRanges();
                      sel.addRange(range);
                    }
                    try {
                      range.deleteContents();
                      range.insertNode(a);
                    } catch {
                      document.execCommand('insertHTML', false, a.outerHTML);
                    }
                    syncEditorToState();
                    if (editorRef.current) {
                      placeCaretAtEnd(editorRef.current);
                    }
                  }
                }}
                style={{ color: 'var(--accent-color, #7C3AED)', background: 'none', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                className="hover:opacity-80 transition-opacity"
              >
                {t('inputContextMenu.add')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        
        .rich-editor::-webkit-scrollbar { 
          display: none; 
        }
        
        .rich-editor, .rich-editor * {
          -webkit-app-region: no-drag;
          user-select: text !important;
          -webkit-user-select: text !important;
        }
        
        .rich-editor[data-empty="true"]::before {
          content: attr(data-placeholder);
          color: var(--text-dim, rgba(255, 255, 255, 0.45));
          pointer-events: none;
          position: absolute;
          top: 0;
          bottom: 0;
          height: 20px;
          line-height: 20px;
          margin: auto 0;
          left: 0;
          cursor: text;
        }

        .rich-editor code {
          font-family: monospace;
          background-color: rgba(255, 255, 255, 0.12);
          padding: 2px 4px;
          border-radius: 4px;
        }

        .rich-editor .spoiler {
          background-color: rgba(255, 255, 255, 0.18);
          filter: blur(3px);
          padding: 0 3px;
          border-radius: 4px;
        }

        button:focus, button:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }

        button, button * {
          user-select: none !important;
          -webkit-user-select: none !important;
        }

        button::selection, button *::selection {
          background: transparent !important;
          color: inherit !important;
        }
      `}</style>
    </div>
  );
});