import { Sun, Moon } from 'lucide-react';

export function ThemeButton({ theme, onToggle }) {
  return (
    <button
      className="icon-btn theme-toggle toolbar-hint"
      aria-label={theme === 'light' ? 'เปลี่ยนเป็นธีมมืด' : 'เปลี่ยนเป็นธีมสว่าง'}
      data-tooltip={theme === 'light' ? 'เปลี่ยนเป็นธีมมืด' : 'เปลี่ยนเป็นธีมสว่าง'}
      onClick={onToggle}
    >
      {theme === 'light' ? (
        <Moon size={20} aria-hidden="true" />
      ) : (
        <Sun size={20} aria-hidden="true" />
      )}
    </button>
  );
}
