import { useEffect, useRef } from "react";

function Modal({ children, onClose, maxWidth = 900 }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="ordy-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="ordy-modal-surface"
        role="dialog"
        aria-modal="true"
        aria-label="Finestra di dialogo"
        style={{ "--ordy-modal-width": `${maxWidth}px` }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="ordy-modal-close"
          onClick={onClose}
          aria-label="Chiudi finestra"
        >
          <span aria-hidden="true">×</span>
        </button>

        {children}
      </div>
    </div>
  );
}

export default Modal;
