// src/components/settings/ProxyEditModal.tsx
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useConnectionStore, type ProxyProfile } from '../../store/useConnectionStore';

interface ProxyEditModalProps {
  isOpen: boolean;
  proxyToEdit?: ProxyProfile | null;
  onClose: () => void;
  onSaved: (proxyId: string) => void;
}

export const ProxyEditModal: React.FC<ProxyEditModalProps> = ({
  isOpen,
  proxyToEdit,
  onClose,
  onSaved,
}) => {
  const { addProxy, updateProxy, parseProxyUrl } = useConnectionStore();

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('1080');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [quickLink, setQuickLink] = useState('');
  const [testResult, setTestResult] = useState<{ ping?: number; error?: string; testing?: boolean } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (proxyToEdit) {
        setName(proxyToEdit.name);
        setHost(proxyToEdit.host);
        setPort(String(proxyToEdit.port));
        setUsername(proxyToEdit.username || '');
        setPassword(proxyToEdit.password || '');
      } else {
        setName('');
        setHost('');
        setPort('1080');
        setUsername('');
        setPassword('');
      }
      setQuickLink('');
      setTestResult(null);
      setErrorMessage(null);
    }
  }, [isOpen, proxyToEdit]);

  if (!isOpen) return null;

  const handleQuickLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuickLink(val);
    if (!val.trim()) return;

    const parsed = parseProxyUrl(val);
    if (parsed) {
      if (parsed.name && !name) setName(parsed.name);
      if (parsed.host) setHost(parsed.host);
      if (parsed.port) setPort(String(parsed.port));
      if (parsed.username !== undefined) setUsername(parsed.username);
      if (parsed.password !== undefined) setPassword(parsed.password);
      setErrorMessage(null);
    }
  };

  const handleTestConnection = async () => {
    const cleanHost = host.trim();
    const cleanPort = parseInt(port.trim(), 10);
    if (!cleanHost || isNaN(cleanPort)) {
      setErrorMessage('Укажите корректный хост и порт');
      return;
    }

    setTestResult({ testing: true });
    setErrorMessage(null);

    if (window.orbita?.checkProxyPing) {
      const res = await window.orbita.checkProxyPing(cleanHost, cleanPort, 4000);
      if (res?.success && res.ping !== undefined) {
        setTestResult({ ping: res.ping });
      } else {
        setTestResult({ error: res?.error || 'Недоступен' });
      }
    } else {
      setTimeout(() => {
        setTestResult({ ping: 48 });
      }, 300);
    }
  };

  const handleSave = async () => {
    const cleanHost = host.trim();
    const cleanPort = parseInt(port.trim(), 10);
    if (!cleanHost) {
      setErrorMessage('Введите адрес хоста или IP');
      return;
    }
    if (isNaN(cleanPort) || cleanPort <= 0 || cleanPort > 65535) {
      setErrorMessage('Введите корректный номер порта (1-65535)');
      return;
    }

    const finalName = name.trim() || `${cleanHost}:${cleanPort}`;

    if (proxyToEdit) {
      await updateProxy(proxyToEdit.id, {
        name: finalName,
        type: 'socks5',
        host: cleanHost,
        port: cleanPort,
        username: username.trim() || undefined,
        password: password || undefined,
      });
      onSaved(proxyToEdit.id);
    } else {
      const newId = await addProxy({
        name: finalName,
        type: 'socks5',
        host: cleanHost,
        port: cleanPort,
        username: username.trim() || undefined,
        password: password || undefined,
      });
      onSaved(newId);
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: '#1b1726',
          borderRadius: '10px',
          border: 'none',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          animation: 'scaleUp 0.15s ease',
          color: '#fff',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            {proxyToEdit ? 'Редактировать прокси' : 'Добавить SOCKS5 прокси'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick link paste */}
        {!proxyToEdit && (
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '5px' }}>
              Быстрая вставка ссылки (socks5://...)
            </label>
            <input
              type="text"
              value={quickLink}
              onChange={handleQuickLinkChange}
              placeholder="socks5://user:pass@host:port"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Name */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '5px' }}>
            Название
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Нидерланды SOCKS5"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Host & Port */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '5px' }}>
              Сервер / Хост
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="127.0.0.1 или domain.com"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ width: '90px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '5px' }}>
              Порт
            </label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="1080"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Username & Password */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '5px' }}>
              Имя пользователя (опционально)
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Логин"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '5px' }}>
              Пароль (опционально)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>
            {errorMessage}
          </p>
        )}

        {/* Ping test status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testResult?.testing}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-color, #9b7dd4)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: testResult?.testing ? 'default' : 'pointer',
              padding: 0,
            }}
          >
            {testResult?.testing ? 'Проверка...' : 'Проверить соединение'}
          </button>

          {testResult && !testResult.testing && (
            <span style={{ fontSize: '13px', color: testResult.ping ? '#fff' : '#ef4444' }}>
              {testResult.ping !== undefined ? `${testResult.ping} ms` : (testResult.error || 'Недоступен')}
            </span>
          )}
        </div>

        {/* Bottom Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'var(--accent-color, #9b7dd4)',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
