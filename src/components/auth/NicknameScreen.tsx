import { useState } from 'react';
import { Box, Typography, TextField, Button, Stack } from '@mui/material';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { generateRandomCode } from '../../lib/codes';
import { useTranslation } from 'react-i18next';

export const NicknameScreen = () => {
  const { t } = useTranslation();
  const { setStep, setNickname } = useAuthStore();
  const [value, setValue] = useState('');

  const handleNext = () => {
    if (value.trim().length >= 2) {
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
          maxWidth: 320,
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
          maxWidth: 320,
          mb: 4,
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

      <Stack direction="row" spacing={2}>
        <Button
          variant="outlined"
          onClick={() => setStep('welcome')}
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
          disabled={value.trim().length < 2}
          onClick={handleNext}
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
