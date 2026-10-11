import { useEffect, useId, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Avatar } from './ui';

export function AccountMenu({ actor, route, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null),
    trigger = useRef(null),
    item = useRef(null);
  const id = useId();
  useEffect(() => {
    setOpen(false);
  }, [route, actor.id, disabled]);
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const outside = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div
      className="account-menu header-avatar"
      ref={wrapper}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
          item.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={'icon-btn account-trigger' + (open ? '' : ' toolbar-hint')}
        aria-label={'เมนูบัญชีของ ' + actor.name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-tooltip={actor.name}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar person={actor} size="small" />
      </button>
      {open && (
        <div className="account-popover" role="menu" aria-label="บัญชีผู้ใช้" id={id}>
          <a
            ref={item}
            role="menuitem"
            href={'#/employee/' + actor.id}
            onClick={() => setOpen(false)}
          >
            <UserRound size={18} aria-hidden="true" />
            โปรไฟล์
          </a>
        </div>
      )}
    </div>
  );
}
