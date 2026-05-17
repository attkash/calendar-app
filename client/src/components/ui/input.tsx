import * as React from "react"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className = "", type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={`flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-foreground shadow-sm placeholder:text-muted [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-muted-foreground ${className}`}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
