import { useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
  /** Defaults to "success" — matches every existing call site's behavior. */
  variant?: "success" | "error";
  /** Milliseconds before it dismisses itself. */
  duration?: number;
}

/**
 * Positioned with inset-inline-end/start (not `right`/`left`), so it
 * correctly sits in the reading-end corner in both LTR and RTL without any
 * conditional CSS. Colors come from theme tokens (see .toast in
 * globals.css), so this renders correctly in both light and dark mode
 * automatically — nothing here is a hardcoded color.
 *
 * Auto-dismisses on its own after `duration` — callers don't each need
 * their own setTimeout. The timer restarts whenever `message` changes, so
 * triggering a second toast while one is already showing gives the new
 * one its own full duration instead of inheriting whatever was left on
 * the previous one's clock.
 */
export function Toast({ message, onDismiss, variant = "success", duration = 3500 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, duration]);

  const Icon = variant === "error" ? XCircle : CheckCircle2;
  return (
    <div className={`toast is-${variant}`} role="status" onClick={onDismiss}>
      <Icon size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
