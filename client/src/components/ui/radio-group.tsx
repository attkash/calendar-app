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
      className={`aspect-square h-4 w-4 rounded-full border-2 border-slate-500 ${isChecked ? "border-white bg-white" : ""} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#122032] ${className}`}
      {...props}
    />
  )
})
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
