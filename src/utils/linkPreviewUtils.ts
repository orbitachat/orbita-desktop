// src/utils/linkPreviewUtils.ts
import { LinkPreviewData } from '../store/useChatStore';

const previewCache = new Map<string, LinkPreviewData | null>();

/**
 * Extracts the first URL from a text message.
 */
export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(
    /\b(?:https?:\/\/|ftp:\/\/)?(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})(?:\/[^\s]*)?/i
  );
  if (!match) return null;
  let url = match[0].trim();
  if (!url.match(/^(https?:\/\/|ftp:\/\/)/i)) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * Helper to extract domain hostname from URL.
 */
export function getDomainHost(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./i, '');
  } catch (e) {
    return urlStr;
  }
}

/**
 * Extracts YouTube video ID from various YouTube URL formats.
 */
export function extractYouTubeVideoId(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      if (url.hostname.includes('youtu.be')) {
        return url.pathname.slice(1).split('/')[0] || null;
      }
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2] || null;
      }
      return url.searchParams.get('v');
    }
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * Special handler for YouTube links using public oEmbed API & direct thumbnail CDN.
 */
async function fetchYouTubePreview(cleanUrl: string): Promise<LinkPreviewData | null> {
  const videoId = extractYouTubeVideoId(cleanUrl);
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
    let responseText = '';
    if (typeof window !== 'undefined' && (window as any).orbita?.fetchUrl) {
      responseText = await (window as any).orbita.fetchUrl(oembedUrl);
    } else {
      const resp = await fetch(oembedUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      responseText = await resp.text();
    }

    const data = JSON.parse(responseText);
    const image = videoId
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      : data.thumbnail_url || '';

    return {
      url: cleanUrl,
      siteName: 'YouTube',
      title: data.title || 'YouTube Video',
      description: data.author_name ? `Автор: ${data.author_name}` : '',
      image,
    };
  } catch (e) {
    if (videoId) {
      return {
        url: cleanUrl,
        siteName: 'YouTube',
        title: 'YouTube Video',
        description: '',
        image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
    return null;
  }
}

/**
 * Parses OpenGraph metadata from HTML string.
 */
function parseOpenGraph(html: string, targetUrl: string): LinkPreviewData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const getMeta = (property: string) => {
    const el =
      doc.querySelector(`meta[property="${property}"]`) ||
      doc.querySelector(`meta[name="${property}"]`) ||
      doc.querySelector(`meta[property="og:${property}"]`) ||
      doc.querySelector(`meta[name="og:${property}"]`);
    return el ? el.getAttribute('content')?.trim() || '' : '';
  };

  const title =
    getMeta('og:title') ||
    getMeta('twitter:title') ||
    getMeta('title') ||
    doc.querySelector('title')?.textContent?.trim() ||
    getDomainHost(targetUrl);

  const description =
    getMeta('og:description') ||
    getMeta('twitter:description') ||
    getMeta('description') ||
    '';

  let image =
    getMeta('og:image') ||
    getMeta('twitter:image') ||
    getMeta('og:image:url') ||
    getMeta('image') ||
    doc.querySelector('link[rel="image_src"]')?.getAttribute('href') ||
    doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ||
    '';

  if (image && !image.match(/^(https?:\/\/|data:)/i)) {
    try {
      image = new URL(image, targetUrl).href;
    } catch (e) {
      image = '';
    }
  }

  const siteName =
    getMeta('og:site_name') ||
    getMeta('application-name') ||
    getDomainHost(targetUrl);

  return {
    url: targetUrl,
    siteName: siteName,
    title,
    description: description.length > 250 ? `${description.slice(0, 250)}...` : description,
    image,
  };
}

/**
 * Fetches OpenGraph link preview metadata safely on sender client side.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  if (!url) return null;
  const cleanUrl = url.trim();

  if (previewCache.has(cleanUrl)) {
    return previewCache.get(cleanUrl) || null;
  }

  // Handle YouTube specially via public oEmbed & CDN
  if (extractYouTubeVideoId(cleanUrl)) {
    const ytPreview = await fetchYouTubePreview(cleanUrl);
    if (ytPreview) {
      previewCache.set(cleanUrl, ytPreview);
      return ytPreview;
    }
  }

  try {
    let html = '';

    // If running in Electron with IPC fetch available
    if (typeof window !== 'undefined' && (window as any).orbita?.fetchUrl) {
      html = await (window as any).orbita.fetchUrl(cleanUrl);
    } else {
      // Fallback fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(cleanUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
    }

    const preview = parseOpenGraph(html, cleanUrl);
    previewCache.set(cleanUrl, preview);
    return preview;
  } catch (err) {
    console.warn('[LinkPreview] Could not fetch OpenGraph for:', cleanUrl, err);
    const fallback: LinkPreviewData = {
      url: cleanUrl,
      siteName: getDomainHost(cleanUrl),
      title: getDomainHost(cleanUrl),
      description: '',
      image: '',
    };
    previewCache.set(cleanUrl, fallback);
    return fallback;
  }
}
