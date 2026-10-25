import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  copy: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Focused destructive confirmation (used for delete; harmless actions skip it). */
export function ConfirmDialog({
  title,
  copy,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  return (
    <Modal label={title} onClose={onCancel}>
      <h2 className="t-h1">{title}</h2>
      <p className="t-body mt-2 text-muted">{copy}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={pending} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
