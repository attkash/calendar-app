import * as React from "react"

const buttonVariants = {
  default: "bg-gray-900 text-white hover:bg-gray-800",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  outline: "border border-slate-500 bg-transparent text-white hover:bg-slate-800",
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
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:pointer-events-none disabled:opacity-50 ${buttonVariants[variant]} ${sizeVariants[size]} ${className}`}
      {...props}
    />
  )
)
Button.displayName = "Button"

export { Button }
