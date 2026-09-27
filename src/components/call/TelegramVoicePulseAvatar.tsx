import React from "react";
import { Avatar } from "../common/Avatar";

interface TelegramVoicePulseAvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  audioElement?: HTMLMediaElement | null;
  mediaStream?: MediaStream | null;
  accentColor?: string;
}

export const TelegramVoicePulseAvatar: React.FC<TelegramVoicePulseAvatarProps> = ({
  src,
  alt = "",
  size = 120,
  accentColor,
}) => {
  const ac = accentColor || "var(--accent-color, #7c3aed)";

  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0 select-none pointer-events-none"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    >
      <div
        className="relative rounded-full flex items-center justify-center pointer-events-none"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          overflow: "hidden",
          background: src ? "transparent" : `linear-gradient(145deg, ${ac}, var(--accent-dark, #5b21b6))`,
          color: "var(--settings-on-primary, #ffffff)",
        }}
      >
        <Avatar
          src={src}
          alt={alt}
          className="w-full h-full object-cover pointer-events-none"
          style={{
            fontSize: `${Math.round(size * 0.38)}px`,
            borderRadius: "50%",
            overflow: "hidden",
          }}
        />
      </div>
    </div>
  );
};
