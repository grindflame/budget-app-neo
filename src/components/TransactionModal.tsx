import React from 'react';
import { X } from 'lucide-react';
import type { TransactionDraft } from './AddTransactionForm';
import { TransactionForm } from './AddTransactionForm';

interface TransactionModalProps {
  open: boolean;
  initial?: Partial<TransactionDraft>;
  submitLabel?: string;
  onSubmit: (t: TransactionDraft) => void;
  onClose: () => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  open,
  initial,
  submitLabel,
  onSubmit,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            zIndex: 2,
          }}
          title="Close"
        >
          <X size={22} />
        </button>

        <TransactionForm
          mode="edit"
          initial={initial}
          submitLabel={submitLabel || 'SAVE CHANGES'}
          onSubmitTransaction={onSubmit}
          onDone={onClose}
        />
      </div>
    </div>
  );
};


