interface ConfirmDialogButton {
  label: string;
  value: string;
}

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  buttons: ConfirmDialogButton[];
  onSelect: (value: string) => void;
}

// Generic confirm modal (doc/spec.md §9.2). Currently used for the single
// "unsaved changes" 3-choice prompt, but takes its buttons as data so it can
// be reused for other yes/no/cancel-shaped confirmations later.
export function ConfirmDialog({ open, message, buttons, onSelect }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="confirm-dialog-overlay">
      <div className="confirm-dialog">
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-buttons">
          {buttons.map((button) => (
            <button key={button.value} type="button" onClick={() => onSelect(button.value)}>
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
