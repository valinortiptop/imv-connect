import { toast as sonnerToast } from "sonner";

type ToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive";
};

export function useToast() {
  return {
    toast: ({ title, description, variant }: ToastInput) => {
      const msg = (title as string) ?? "";
      const opts = description ? { description: description as string } : undefined;
      if (variant === "destructive") return sonnerToast.error(msg, opts);
      return sonnerToast(msg, opts);
    },
    dismiss: sonnerToast.dismiss,
  };
}

export const toast = (input: ToastInput) => useToast().toast(input);
