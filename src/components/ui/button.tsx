import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-40 select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--color-accent)] text-white shadow-sm hover:bg-[var(--color-accent-hover)] active:scale-[.98]',
        secondary:
          'bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] border border-[var(--color-border)] shadow-sm hover:bg-[var(--color-surface-sunken)] active:scale-[.98]',
        ghost:
          'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]',
        danger:
          'bg-red-500 text-white shadow-sm hover:bg-red-600 active:scale-[.98]',
        outline:
          'border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)]',
      },
      size: {
        xs:   'h-7 px-2.5 text-xs rounded-md',
        sm:   'h-8 px-3',
        md:   'h-9 px-4',
        lg:   'h-10 px-5 text-base',
        icon: 'size-9 rounded-lg',
        'icon-sm': 'size-7 rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
