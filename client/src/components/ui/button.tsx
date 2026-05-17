import * as React from "react"

const buttonVariants = {
  default:
    "bg-accent text-on-accent hover:bg-accent-hover shadow-md shadow-accent/25 font-medium",
  destructive: "bg-red-600 text-on-accent hover:bg-red-700 shadow-sm",
  outline:
    "border border-border bg-input text-foreground hover:bg-surface shadow-sm",
}

const sizeVariants = {
  default: "h-10 px-4 py-2",
  sm: "h-8 px-3 text-sm",
  icon: "h-10 w-10",
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants
  size?: keyof typeof sizeVariants
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-lg font-sans transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 ${buttonVariants[variant]} ${sizeVariants[size]} ${className}`}
      {...props}
    />
  )
)
Button.displayName = "Button"

export { Button }
