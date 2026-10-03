import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/*
 * shadcn/ui button restyled to the proposal: 44 px high, 16 px bold label,
 * 2 px border, words on every button. "btn" marks links styled as buttons,
 * so the contrast version gives them a ring instead of a highlight.
 */
export const buttonVariants = cva(
  "btn inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-2 px-5 py-2 text-center text-base leading-snug font-bold no-underline transition-colors [&_svg]:size-5 [&_svg]:shrink-0 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover hover:text-primary-foreground",
        secondary: "border-primary bg-background text-primary hover:bg-accent hover:text-primary-hover",
        text: "border-transparent bg-transparent px-1 text-primary underline underline-offset-4 hover:text-primary-hover hover:decoration-[3px]",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}
