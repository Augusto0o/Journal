import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { BottomSheet } from './BottomSheet';
import { cx } from '@/utils/misc';

// ---------------- Toasts ----------------
interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  tone?: 'default' | 'error';
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface FeedbackContext {
  toast: (message: string, opts?: { action?: Toast['action']; tone?: Toast['tone']; duration?: number }) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<FeedbackContext | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<(Toast & { leaving?: boolean })[]>([]);
  const idRef = useRef(0);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 200);
  }, []);

  const toast = useCallback<FeedbackContext['toast']>(
    (message, opts = {}) => {
      const id = ++idRef.current;
      setToasts((t) => [...t.slice(-2), { id, message, action: opts.action, tone: opts.tone }]);
      setTimeout(() => dismiss(id), opts.duration ?? (opts.action ? 5000 : 2600));
    },
    [dismiss],
  );

  const confirm = useCallback<FeedbackContext['confirm']>((opts) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve });
      setConfirmOpen(true);
    });
  }, []);

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmOpen(false);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('toast', t.leaving && 'is-leaving', t.tone === 'error' && 'is-error')}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <BottomSheet open={confirmOpen} onClose={() => close(false)} title={confirmState?.title} description={confirmState?.message} className="confirm-sheet" initialFocus="none">
        <div className="confirm-actions">
          <button type="button" className={cx('btn btn-block', confirmState?.danger ? 'btn-danger' : 'btn-primary')} onClick={() => close(true)}>
            {confirmState?.confirmLabel ?? 'Confirmar'}
          </button>
          <button type="button" className="btn btn-block btn-ghost" onClick={() => close(false)}>
            {confirmState?.cancelLabel ?? 'Cancelar'}
          </button>
        </div>
      </BottomSheet>
    </Ctx.Provider>
  );
}

export function useFeedback() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFeedback fuera de FeedbackProvider');
  return c;
}
