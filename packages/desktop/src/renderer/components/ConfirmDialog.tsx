import { AlertCircle } from "lucide-react";
import logoUrl from "../assets/logo.png";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "warning",
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case "danger":
        return {
          confirmBg: "bg-danger hover:bg-danger/90",
          iconColor: "text-danger",
        };
      case "warning":
        return {
          confirmBg: "bg-lseg-blue hover:bg-lseg-blue-dark",
          iconColor: "text-lseg-blue",
        };
      case "info":
        return {
          confirmBg: "bg-lseg-blue hover:bg-lseg-blue-dark",
          iconColor: "text-lseg-blue",
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header with logo */}
        <div className="px-6 pt-6 pb-4 flex flex-col items-center">
          <div className="w-16 h-16 mb-4 flex items-center justify-center">
            <img 
              src={logoUrl} 
              alt="Promptwright" 
              className="w-full h-full object-contain drop-shadow-md"
            />
          </div>
          <h2 className="text-xl font-bold text-text text-center">
            {title}
          </h2>
        </div>

        {/* Message */}
        <div className="px-6 pb-6">
          <p className="text-text-muted text-center whitespace-pre-line">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg font-medium text-text-muted bg-surface-2 hover:bg-border transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-lg font-medium text-white transition-colors ${styles.confirmBg}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
