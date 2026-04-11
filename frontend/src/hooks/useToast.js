import { useState, useCallback } from "react";

export const useToast = () => {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, variant = "success") => {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  return { toast, showToast };
};
