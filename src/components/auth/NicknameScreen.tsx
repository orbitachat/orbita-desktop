import { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Stack } from '@mui/material';
import { Copy, Check, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { generateRandomCode } from '../../lib/codes';
import { useTranslation } from 'react-i18next';
import { accountSyncService } from '../../services/accountSyncService';

export const NicknameScreen = () => {
  const { t } = useTranslation();
  const { setStep, setNickname } = useAuthStore();
  const masterSeed = useAuthStore((state) => state.masterSeed) || '';
  const [value, setValue] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    accountSyncService.ensureMasterSeed();
  }, []);

  const handleCopyKey = async () => {
    const currentSeed = useAuthStore.getState().masterSeed;
    if (!currentSeed) return;
    try {
      await navigator.clipboard.writeText(currentSeed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleNext = () => {
    if (value.trim().length >= 1) {
      setNickname(value.trim());
      const currentCode = useChatStore.getState().myCode;
      if (!currentCode) {
        useChatStore.getState().setMyCode(generateRandomCode());
      }
      setStep('main');
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        px: 4,
        userSelect: 'none',
        backgroundColor: 'var(--bg-primary, #14111d)',
      }}
    >
      <Typography
        variant="h6"
        sx={{
          mb: 1,
          fontWeight: 900,
          width: '100%',
          maxWidth: 380,
          textAlign: 'left',
          color: 'var(--text-main, #ffffff)',
        }}
      >
        {t('nickname.title')}
      </Typography>

      <TextField
        fullWidth
        variant="standard"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleNext()}
        autoFocus
        slotProps={{ htmlInput: { maxLength: 24 } }}
        sx={{
          maxWidth: 380,
          mb: 3,
          backgroundColor: 'transparent',
          '& .MuiInput-root': {
            color: 'var(--text-main, #ffffff)',
            '&:before': {
              borderBottomColor: 'var(--border-color)',
            },
            '&:hover:not(.Mui-disabled):before': {
              borderBottomColor: 'var(--border-color)',
            },
            '&:after': {
              display: 'none',
            },
            '&.Mui-focused:before': {
              borderBottomColor: 'var(--accent-color) !important',
              borderBottomWidth: '1px !important',
            },
          },
          '& .MuiInputBase-input': {
            color: 'var(--text-main, #ffffff)',
            userSelect: 'text',
            py: 1,
            fontSize: '18px',
          },
        }}
      />

      {masterSeed && (
        <Box
          sx={{
            width: '100%',
            maxWidth: 380,
            mb: 3,
            p: 2,
            borderRadius: '14px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShieldCheck size={16} color="var(--accent-color, #9b7dd4)" />
              <Typography sx={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.9)' }}>
                {t('nickname.master_key_title')}
              </Typography>
            </Box>
            <Button
              size="small"
              onClick={handleCopyKey}
              aria-label={t('nickname.copy_key')}
              sx={{
                minWidth: 'auto',
                py: 0.5,
                px: 1,
                fontSize: '11px',
                fontWeight: 600,
                color: copied ? '#4ade80' : 'var(--accent-color, #9b7dd4)',
                backgroundColor: copied ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
                },
              }}
            >
              {copied ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Check size={12} />
                  <span>{t('nickname.key_copied')}</span>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Copy size={12} />
                  <span>{t('nickname.copy_key')}</span>
                </Box>
              )}
            </Button>
          </Box>

          <Typography
            sx={{
              fontFamily: 'monospace',
              fontSize: '11px',
              wordBreak: 'break-all',
              lineHeight: 1.4,
              color: 'rgba(255, 255, 255, 0.65)',
              userSelect: 'text',
              p: 1,
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
            }}
          >
            {masterSeed}
          </Typography>

          <Typography sx={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', lineHeight: 1.3 }}>
            {t('nickname.master_key_desc')}
          </Typography>
        </Box>
      )}

      <Stack direction="row" spacing={2}>
        <Button
          variant="outlined"
          onClick={() => setStep('welcome')}
          aria-label={t('nickname.back')}
          sx={{
            borderRadius: '10px',
            borderColor: 'var(--border-color)',
            color: 'var(--text-main, #ffffff)',
            px: 3,
            '&:hover': {
              borderColor: 'var(--accent-color)',
              backgroundColor: 'rgba(255,255,255,0.05)',
            },
            userSelect: 'none',
          }}
        >
          {t('nickname.back')}
        </Button>
        <Button
          variant="contained"
          disabled={value.trim().length < 1}
          onClick={handleNext}
          aria-label={t('nickname.next')}
          sx={{
            borderRadius: '10px',
            px: 3,
            color: '#fff',
            background: 'linear-gradient(135deg, var(--accent-color, #7C3AED) 0%, var(--accent-dark, #5B21B6) 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, var(--accent-light, #9a82db) 0%, var(--accent-color, #7C3AED) 100%)',
            },
            '&.Mui-disabled': {
              background: 'rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.38)',
              cursor: 'not-allowed',
              pointerEvents: 'none',
            },
            userSelect: 'none',
          }}
        >
          {t('nickname.next')}
        </Button>
      </Stack>
    </Box>
  );
};
