import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export const SpoilerSpan: React.FC<{ content: string }> = ({ content }) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(!revealed);
      }}
      style={{
        filter: revealed ? 'none' : 'blur(4px)',
        backgroundColor: revealed ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
        borderRadius: '3px',
        padding: '0 4px',
        cursor: 'pointer',
        transition: 'filter 0.2s ease, background-color 0.2s ease',
        userSelect: revealed ? 'text' : 'none',
      }}
      aria-label={revealed ? undefined : t('chatWindow.clickToShowSpoiler')}
    >
      {content}
    </span>
  );
};

export function renderFormattedInlineText(
  rawText: string,
  themeColor: string,
  onLinkClick?: (url: string) => void
): React.ReactNode[] {
  const regex = /(\[(.*?)\]\(((?:https?:\/\/|ftp:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})[^\s)]*)\)|(?:https?:\/\/|ftp:\/\/)[^\s<>"'\)]+|\b(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})(?:\/[^\s<>"'\)]*)?|\*\*(.*?)\*\*|<b>(.*?)<\/b>|\*(.*?)\*|<i>(.*?)<\/i>|<u>(.*?)<\/u>|~~(.*?)~~|<s>(.*?)<\/s>|`(.*?)`|\|\|(.*?)\|\||<spoiler>(.*?)<\/spoiler>)/gi;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = regex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      result.push(rawText.substring(lastIndex, match.index));
    }

    const fullMatch = match[0];
    const mdLinkLabel = match[2];
    const mdLinkUrl = match[3];
    const boldText = match[4] || match[5];
    const italicText = match[6] || match[7];
    const underlineText = match[8];
    const strikeText = match[9] || match[10];
    const codeText = match[11];
    const spoilerText = match[12] || match[13];

    if (mdLinkLabel && mdLinkUrl) {
      const targetUrl = mdLinkUrl.match(/^(https?:\/\/|ftp:\/\/)/i) ? mdLinkUrl : `http://${mdLinkUrl}`;
      result.push(
        <a
          key={`link-${keyCounter++}`}
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onLinkClick) {
              onLinkClick(targetUrl);
            }
          }}
          style={{ color: themeColor, textDecoration: 'none', cursor: 'pointer' }}
        >
          {mdLinkLabel}
        </a>
      );
    } else if (
      fullMatch.match(/^(https?:\/\/|ftp:\/\/)/i) ||
      fullMatch.match(/^\b(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})/i)
    ) {
      const targetUrl = fullMatch.match(/^(https?:\/\/|ftp:\/\/)/i) ? fullMatch : `http://${fullMatch}`;
      result.push(
        <a
          key={`link-${keyCounter++}`}
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onLinkClick) {
              onLinkClick(targetUrl);
            }
          }}
          style={{ color: themeColor, textDecoration: 'none', cursor: 'pointer' }}
        >
          {fullMatch}
        </a>
      );
    } else if (boldText !== undefined) {
      result.push(<strong key={`bold-${keyCounter++}`}>{boldText}</strong>);
    } else if (italicText !== undefined) {
      result.push(<em key={`italic-${keyCounter++}`}>{italicText}</em>);
    } else if (underlineText !== undefined) {
      result.push(<u key={`underline-${keyCounter++}`}>{underlineText}</u>);
    } else if (strikeText !== undefined) {
      result.push(<del key={`strike-${keyCounter++}`}>{strikeText}</del>);
    } else if (codeText !== undefined) {
      result.push(
        <code
          key={`code-${keyCounter++}`}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.9em',
          }}
        >
          {codeText}
        </code>
      );
    } else if (spoilerText !== undefined) {
      result.push(<SpoilerSpan key={`spoiler-${keyCounter++}`} content={spoilerText} />);
    } else {
      result.push(fullMatch);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < rawText.length) {
    result.push(rawText.substring(lastIndex));
  }

  return result;
}

interface MessageTextProps {
  text: string;
  timeNode: React.ReactNode;
  themeColor: string;
  isOwn?: boolean;
  isPinned?: boolean;
  onLinkClick?: (url: string) => void;
}

export const MessageText: React.FC<MessageTextProps> = ({
  text,
  timeNode,
  themeColor,
  isOwn = true,
  isPinned = false,
  onLinkClick,
}) => {
  const processedNodes = useMemo(() => {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let inQuote = false;
    let quoteLines: string[] = [];

    lines.forEach((line, idx) => {
      if (line.startsWith('> ')) {
        inQuote = true;
        quoteLines.push(line.substring(2));
      } else {
        if (inQuote) {
          nodes.push(
            <blockquote
              key={`quote-${idx}`}
              style={{
                borderLeft: '3px solid var(--accent-color, #7C3AED)',
                paddingLeft: '8px',
                margin: '4px 0',
                opacity: 0.95,
              }}
            >
              {renderFormattedInlineText(quoteLines.join('\n'), themeColor, onLinkClick)}
            </blockquote>
          );
          quoteLines = [];
          inQuote = false;
        }
        nodes.push(
          <React.Fragment key={`line-${idx}`}>
            {renderFormattedInlineText(line, themeColor, onLinkClick)}
            {idx < lines.length - 1 && <br />}
          </React.Fragment>
        );
      }
    });

    if (inQuote && quoteLines.length > 0) {
      nodes.push(
        <blockquote
          key="quote-last"
          style={{
            borderLeft: '3px solid var(--accent-color, #7C3AED)',
            paddingLeft: '8px',
            margin: '4px 0',
            opacity: 0.95,
          }}
        >
          {renderFormattedInlineText(quoteLines.join('\n'), themeColor, onLinkClick)}
        </blockquote>
      );
    }

    return nodes;
  }, [text, themeColor, onLinkClick]);

  const spacerWidth = isOwn ? (isPinned ? '72px' : '60px') : (isPinned ? '52px' : '40px');

  return (
    <div
      className="select-text"
      style={{
        fontSize: 'inherit',
        lineHeight: 1.5,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        width: '100%',
        position: 'relative',
      }}
    >
      <span className="selectable-message-text" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
        {processedNodes}
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: spacerWidth,
            height: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        />
      </span>
      <span
        aria-hidden
        className="flex-shrink-0 select-none message-time-badge"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          lineHeight: 1,
          position: 'absolute',
          bottom: '0px',
          right: '0px',
          whiteSpace: 'nowrap',
        }}
      >
        {timeNode}
      </span>
    </div>
  );
};
