import * as React from "react"

interface RadioGroupContextValue {
  value: string
  onValueChange: (value: string) => void
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null)

const RadioGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value?: string
    onValueChange?: (value: string) => void
  }
>(({ className = "", value = "", onValueChange, children, ...props }, ref) => (
  <RadioGroupContext.Provider value={{ value, onValueChange: onValueChange || (() => {}) }}>
    <div ref={ref} className={`grid gap-2 ${className}`} role="radiogroup" {...props}>
      {children}
    </div>
  </RadioGroupContext.Provider>
))
RadioGroup.displayName = "RadioGroup"

const RadioGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.HTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className = "", value, id, ...props }, ref) => {
  const context = React.useContext(RadioGroupContext)
  const isChecked = context?.value === value
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={isChecked}
      id={id}
      onClick={() => context?.onValueChange(value)}
      className={`aspect-square h-4 w-4 shrink-0 rounded-full border-2 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 focus:ring-offset-surface ${
        isChecked
          ? "border-accent bg-accent shadow-[inset_0_0_0_3px_#ffffff]"
          : "border-border bg-input hover:border-muted"
      } ${className}`}
      {...props}
    />
  )
})
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
