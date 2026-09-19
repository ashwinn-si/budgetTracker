import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "accent-ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  fullWidth?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      isLoading = false,
      icon,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "min-h-[44px] px-3.5 py-1.5 text-sm gap-1.5 rounded-xl",
      md: "min-h-[44px] px-5 py-2.5 text-sm sm:text-base gap-2 rounded-2xl",
      lg: "min-h-[48px] px-6 py-3 text-base gap-2.5 rounded-2xl",
      icon: "min-h-[44px] min-w-[44px] p-2.5 rounded-xl",
    };

    const variantClasses = {
      primary: "btn-primary",
      ghost: "btn-ghost",
      "accent-ghost": "btn-accent-ghost",
      danger:
        "bg-rose-500/90 text-white hover:bg-rose-600 shadow-md shadow-rose-500/20 active:scale-98",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={twMerge(
          clsx(
            "btn-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
            sizeClasses[size],
            variantClasses[variant],
            fullWidth && "w-full",
            className
          )
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          icon && <span className="inline-flex shrink-0">{icon}</span>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
