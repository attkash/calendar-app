import * as React from "react"

const inputClassName =
  "flex h-10 w-full rounded-lg border border-border bg-input px-3 py-2 text-base text-foreground shadow-sm placeholder:text-muted focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-muted-foreground"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className = "", type, ...props }, ref) => (
    <input type={type} ref={ref} className={`${inputClassName} ${className}`} {...props} />
  )
)
Input.displayName = "Input"

export { Input, inputClassName }
