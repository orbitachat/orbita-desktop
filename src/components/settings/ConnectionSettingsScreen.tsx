import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  RotateCw,
  MoreVertical,
  Trash2,
  Edit2,
  Copy,
  Check,
  Shield,
  Phone,
  Radio,
} from 'lucide-react';
import { useConnectionStore, type ProxyProfile } from '../../store/useConnectionStore';
import { ProxyEditModal } from './ProxyEditModal';
import { PillToggle } from '../common/PillToggle';

interface ConnectionSettingsScreenProps {
  onBack?: () => void;
}

export const ConnectionSettingsScreen: React.FC<ConnectionSettingsScreenProps> = () => {
  const {
    proxyEnabled,
    activeProxyId,
    proxies,
    killSwitch,
    proxyCalls,
    autoFallback,
    setProxyEnabled,
    setActiveProxy,
    deleteProxy,
    setKillSwitch,
    setProxyCalls,
    setAutoFallback,
    checkAllPings,
    checkPing,
  } = useConnectionStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<ProxyProfile | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isRefreshingPings, setIsRefreshingPings] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Check pings on mount
  useEffect(() => {
    checkAllPings();
  }, []);

  const handleRefreshPings = async () => {
    setIsRefreshingPings(true);
    await checkAllPings();
    setIsRefreshingPings(false);
  };

  const handleCopyLink = (proxy: ProxyProfile) => {
    const auth = proxy.username ? `${encodeURIComponent(proxy.username)}${proxy.password ? `:${encodeURIComponent(proxy.password)}` : ''}@` : '';
    const link = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
    navigator.clipboard.writeText(link);
    setCopiedId(proxy.id);
    setTimeout(() => setCopiedId(null), 2000);
    setActiveMenuId(null);
  };

  const activeProxy = proxies.find((p) => p.id === activeProxyId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{
        padding: '0 10px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        color: '#fff',
        userSelect: 'none',
      }}
    >
      {/* 1. Main Proxy Master Toggle Card */}
      <div
        style={{
          backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.03))',
          borderRadius: '10px',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
            Использовать прокси
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>
            {proxyEnabled
              ? activeProxy
                ? `Подключено: ${activeProxy.name}${activeProxy.ping ? ` (${activeProxy.ping} ms)` : ''}`
                : 'Подключение к прокси...'
              : 'Прямое подключение к сети'}
          </div>
        </div>

        <PillToggle checked={proxyEnabled} onChange={() => setProxyEnabled(!proxyEnabled)} />
      </div>

      {/* 2. Proxy List Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Сохранённые прокси
          </span>
          <button
            type="button"
            onClick={handleRefreshPings}
            disabled={isRefreshingPings}
            title="Обновить пинг"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-color, #9b7dd4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              padding: '2px 4px',
            }}
          >
            <RotateCw size={13} className={isRefreshingPings ? 'animate-spin' : ''} />
            <span>Обновить</span>
          </button>
        </div>

        <div
          style={{
            backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.03))',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {proxies.map((proxy, idx) => {
            const isSelected = proxy.id === activeProxyId;
            const hasMenu = activeMenuId === proxy.id;

            return (
              <div
                key={proxy.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: idx < proxies.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                  backgroundColor: isSelected && proxyEnabled ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onClick={() => {
                  setActiveProxy(proxy.id);
                }}
              >
                {/* Left: Radio + Name/Host */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: isSelected && proxyEnabled ? '5px solid var(--accent-color, #9b7dd4)' : '2px solid rgba(255, 255, 255, 0.3)',
                      boxSizing: 'border-box',
                      flexShrink: 0,
                      transition: 'border 0.15s ease',
                    }}
                  />

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 500, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>
                      {proxy.name}
                    </span>
                    <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.4)', display: 'block', marginTop: '1px' }}>
                      {proxy.type.toUpperCase()} • {proxy.host}:{proxy.port}
                    </span>
                  </div>
                </div>

                {/* Right: Clean Ping in ms + More Menu */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', color: proxy.pingStatus === 'error' ? '#ef4444' : 'rgba(255, 255, 255, 0.6)' }}>
                    {proxy.pingStatus === 'testing'
                      ? 'Проверка...'
                      : proxy.ping !== null && proxy.ping !== undefined
                      ? `${proxy.ping} ms`
                      : proxy.pingStatus === 'error'
                      ? 'Недоступен'
                      : '—'}
                  </span>

                  {/* Actions button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(hasMenu ? null : proxy.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.6)',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>

                {/* Context Dropdown Menu */}
                {hasMenu && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(null);
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        right: '16px',
                        top: '40px',
                        backgroundColor: '#1b1726',
                        borderRadius: '10px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.65)',
                        padding: '4px',
                        zIndex: 999,
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: '150px',
                        animation: 'fadeIn 0.1s ease',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          checkPing(proxy.id);
                          setActiveMenuId(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          fontSize: '13px',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <RotateCw size={14} />
                        <span>Проверить пинг</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingProxy(proxy);
                          setModalOpen(true);
                          setActiveMenuId(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          fontSize: '13px',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <Edit2 size={14} />
                        <span>Изменить</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyLink(proxy)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          fontSize: '13px',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {copiedId === proxy.id ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                        <span>{copiedId === proxy.id ? 'Скопировано!' : 'Скопировать ссылку'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          deleteProxy(proxy.id);
                          setActiveMenuId(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          fontSize: '13px',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <Trash2 size={14} />
                        <span>Удалить</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Add Proxy Button */}
          <button
            type="button"
            onClick={() => {
              setEditingProxy(null);
              setModalOpen(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              color: 'var(--accent-color, #9b7dd4)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              borderTop: proxies.length > 0 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
            }}
          >
            <Plus size={16} />
            <span>Добавить SOCKS5 прокси</span>
          </button>
        </div>
      </div>

      {/* 3. Security & Calls Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 8px' }}>
          Безопасность и звонки
        </span>

        <div
          style={{
            backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.03))',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Kill Switch */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingRight: '12px' }}>
              <Shield size={18} style={{ marginTop: '2px', color: 'rgba(255, 255, 255, 0.8)', flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 500, display: 'block', color: '#fff' }}>
                  Kill Switch
                </span>
                <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '2px', display: 'block', lineHeight: 1.35 }}>
                  Блокировать трафик при обрыве связи с прокси для защиты IP-адреса.
                </span>
              </div>
            </div>

            <PillToggle checked={killSwitch} onChange={() => setKillSwitch(!killSwitch)} />
          </div>

          {/* Proxy Calls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingRight: '12px' }}>
              <Phone size={18} style={{ marginTop: '2px', color: 'rgba(255, 255, 255, 0.8)', flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 500, display: 'block', color: '#fff' }}>
                  Проксировать звонки
                </span>
                <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '2px', display: 'block', lineHeight: 1.35 }}>
                  Маршрутизировать голосовые и видеозвонки через прокси-туннель.
                </span>
              </div>
            </div>

            <PillToggle checked={proxyCalls} onChange={() => setProxyCalls(!proxyCalls)} />
          </div>

          {/* Auto Fallback */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingRight: '12px' }}>
              <Radio size={18} style={{ marginTop: '2px', color: 'rgba(255, 255, 255, 0.8)', flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 500, display: 'block', color: '#fff' }}>
                  Авто-переключение при сбое
                </span>
                <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '2px', display: 'block', lineHeight: 1.35 }}>
                  Автоматически переключаться на резервный рабочий прокси при падении активного.
                </span>
              </div>
            </div>

            <PillToggle checked={autoFallback} onChange={() => setAutoFallback(!autoFallback)} />
          </div>
        </div>
      </div>

      {/* Proxy Add / Edit Modal */}
      <ProxyEditModal
        isOpen={modalOpen}
        proxyToEdit={editingProxy}
        onClose={() => {
          setModalOpen(false);
          setEditingProxy(null);
        }}
        onSaved={(id) => {
          setActiveProxy(id);
        }}
      />
    </motion.div>
  );
};
