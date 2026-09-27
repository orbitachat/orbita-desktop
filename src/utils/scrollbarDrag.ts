export function handleScrollbarThumbMouseDown(
  e: React.MouseEvent<HTMLDivElement>,
  container: HTMLElement | null
) {
  if (!container) return;
  e.preventDefault();
  e.stopPropagation();

  const startY = e.clientY;
  const startScrollTop = container.scrollTop;
  const scrollableHeight = container.scrollHeight - container.clientHeight;
  const parentHeight = container.clientHeight;
  const thumbHeight = Math.max(30, (container.clientHeight / container.scrollHeight) * container.clientHeight);
  const trackAvailable = parentHeight - thumbHeight;

  if (trackAvailable <= 0 || scrollableHeight <= 0) return;

  const ratio = scrollableHeight / trackAvailable;
  const thumbEl = e.currentTarget;
  thumbEl.classList.add('is-dragging');

  const onMouseMove = (moveEvent: MouseEvent) => {
    moveEvent.preventDefault();
    const deltaY = moveEvent.clientY - startY;
    container.scrollTop = startScrollTop + deltaY * ratio;
  };

  const onMouseUp = () => {
    thumbEl.classList.remove('is-dragging');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

export function handleScrollbarTrackMouseDown(
  e: React.MouseEvent<HTMLDivElement>,
  container: HTMLElement | null
) {
  if (!container) return;
  e.preventDefault();
  e.stopPropagation();

  const rect = e.currentTarget.getBoundingClientRect();
  const clickY = e.clientY - rect.top;
  const percent = clickY / rect.height;
  container.scrollTop = percent * (container.scrollHeight - container.clientHeight);
}
